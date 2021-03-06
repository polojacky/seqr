from collections import defaultdict
from elasticsearch_dsl import Index
import json
import logging

from datetime import datetime, timedelta
from dateutil import relativedelta as rdelta
from django.contrib.admin.views.decorators import staff_member_required
from django.db.models import prefetch_related_objects, Q, Prefetch, Max
from django.utils import timezone

from seqr.utils.es_utils import get_es_client, get_latest_loaded_samples
from seqr.utils.gene_utils import get_genes
from seqr.utils.xpos_utils import get_chrom_pos

from seqr.views.apis.auth_api import API_LOGIN_REQUIRED_URL
from seqr.views.utils.json_utils import create_json_response, _to_camel_case
from seqr.views.utils.orm_to_json_utils import _get_json_for_individuals, get_json_for_saved_variants
from seqr.views.utils.variant_utils import variant_details
from seqr.models import Project, Family, VariantTag, VariantTagType, Sample, SavedVariant, Individual, ProjectCategory
from reference_data.models import Omim

from settings import SEQR_ID_TO_MME_ID_MAP, ELASTICSEARCH_SERVER

logger = logging.getLogger(__name__)


@staff_member_required(login_url=API_LOGIN_REQUIRED_URL)
def elasticsearch_status(request):
    client = get_es_client()

    disk_fields = ['node', 'disk.avail', 'disk.used', 'disk.percent']
    disk_status = [{
        _to_camel_case(field.replace('.', '_')): disk[field] for field in disk_fields
    } for disk in client.cat.allocation(format="json", h=','.join(disk_fields))]

    index_fields = ['index', 'docs.count', 'store.size', 'creation.date.string']
    indices = [{
        _to_camel_case(field.replace('.', '_')): index[field] for field in index_fields
    } for index in client.cat.indices(format="json", h=','.join(index_fields))
        if index['index'] not in ['.kibana', 'index_operations_log']]

    aliases = defaultdict(list)
    for alias in client.cat.aliases(format="json", h='alias,index'):
        aliases[alias['alias']].append(alias['index'])

    mappings = Index('_all', using=client).get_mapping(doc_type='variant')

    latest_loaded_samples = get_latest_loaded_samples()
    prefetch_related_objects(latest_loaded_samples, 'individual__family__project')
    seqr_index_projects = defaultdict(lambda: defaultdict(set))
    es_projects = set()
    for sample in latest_loaded_samples:
        for index_name in sample.elasticsearch_index.split(','):
            project = sample.individual.family.project
            es_projects.add(project)
            if index_name in aliases:
                for aliased_index_name in aliases[index_name]:
                    seqr_index_projects[aliased_index_name][project].add(sample.individual.guid)
            else:
                seqr_index_projects[index_name.rstrip('*')][project].add(sample.individual.guid)

    for index in indices:
        index_name = index['index']
        index_mapping = mappings[index_name]['mappings']['variant']
        index.update(index_mapping.get('_meta', {}))
        index['hasNestedGenotypes'] = 'samples_num_alt_1' in index_mapping['properties']

        projects_for_index = []
        for index_prefix in seqr_index_projects.keys():
            if index_name.startswith(index_prefix):
                projects_for_index += seqr_index_projects.pop(index_prefix).keys()
        index['projects'] = [{'projectGuid': project.guid, 'projectName': project.name} for project in projects_for_index]

    errors = ['{} does not exist and is used by project(s) {}'.format(
        index, ', '.join(['{} ({} samples)'.format(p.name, len(indivs)) for p, indivs in project_individuals.items()])
    ) for index, project_individuals in seqr_index_projects.items() if project_individuals]

    # TODO remove once all projects are switched off of mongo
    all_mongo_samples = Sample.objects.filter(
        dataset_type=Sample.DATASET_TYPE_VARIANT_CALLS,
        sample_status=Sample.SAMPLE_STATUS_LOADED,
        elasticsearch_index__isnull=True,
    ).exclude(individual__family__project__in=es_projects).prefetch_related('individual', 'individual__family__project')
    mongo_sample_individual_max_loaded_date = {
        agg['individual__guid']: agg['max_loaded_date'] for agg in
        all_mongo_samples.values('individual__guid').annotate(max_loaded_date=Max('loaded_date'))
    }
    mongo_project_samples = defaultdict(set)
    for s in all_mongo_samples:
        if s.loaded_date == mongo_sample_individual_max_loaded_date[s.individual.guid]:
            mongo_project_samples[s.individual.family.project].add(s.dataset_file_path)
    mongo_projects = [{'projectGuid': project.guid, 'projectName': project.name, 'sourceFilePaths': sample_file_paths}
                      for project, sample_file_paths in mongo_project_samples.items()]

    return create_json_response({
        'indices': indices,
        'diskStats': disk_status,
        'elasticsearchHost': ELASTICSEARCH_SERVER,
        'mongoProjects': mongo_projects,
        'errors': errors,
    })


@staff_member_required(login_url=API_LOGIN_REQUIRED_URL)
def anvil_export(request, project_guid):
    if project_guid == 'all':
        project_guid = None

    if project_guid:
        projects_by_guid = {project_guid: Project.objects.get(guid=project_guid)}
    else:
        projects_by_guid = {p.guid: p for p in Project.objects.filter(projectcategory__name__iexact='anvil')}

    families = _get_over_year_loaded_project_families(projects_by_guid.values())
    prefetch_related_objects(families, 'individual_set')

    saved_variants_by_family = _get_saved_variants_by_family(projects_by_guid.values(), request.user)

    # Handle compound het genes
    compound_het_gene_id_by_family = {}
    for family_guid, saved_variants in saved_variants_by_family.items():
        if len(saved_variants) > 1:
            potential_compound_het_variants = [
                variant for variant in saved_variants if all(gen['numAlt'] < 2 for gen in variant['genotypes'].values())
            ]
            main_gene_ids = {variant['mainTranscript']['geneId'] for variant in potential_compound_het_variants}
            if len(main_gene_ids) > 1:
                # This occurs in compound hets where some hits have a primary transcripts in different genes
                for gene_id in main_gene_ids:
                    if all(gene_id in variant['transcripts'] for variant in potential_compound_het_variants):
                        compound_het_gene_id_by_family[family_guid] = gene_id

    individuals = set()
    for family in families:
        individuals.update(family.individual_set.all())
    rows = _get_json_for_individuals(list(individuals), project_guid=project_guid, family_fields=['family_id', 'coded_phenotype'])

    gene_ids = set()
    for row in rows:
        row['Project_ID'] = projects_by_guid[row['projectGuid']].name

        saved_variants = saved_variants_by_family[row['familyGuid']]
        row['numSavedVariants'] = len(saved_variants)
        for i, variant in enumerate(saved_variants):
            genotype = variant['genotypes'].get(row['individualGuid'], {})
            if genotype.get('numAlt', -1) > 0:
                gene_id = compound_het_gene_id_by_family.get(row['familyGuid']) or variant['mainTranscript']['geneId']
                gene_ids.add(gene_id)
                variant_fields = {
                    'Zygosity': 'heterozygous' if genotype['numAlt'] == 1 else 'homozygous',
                    'Chrom': variant['chrom'],
                    'Pos': variant['pos'],
                    'Ref': variant['ref'],
                    'Alt': variant['alt'],
                    'hgvsc': variant['mainTranscript']['hgvsc'],
                    'hgvsp': variant['mainTranscript']['hgvsp'],
                    'Transcript': variant['mainTranscript']['transcriptId'],
                    'geneId': gene_id,
                }
                row.update({'{}-{}'.format(k, i + 1): v for k, v in variant_fields.items()})

    genes_by_id = get_genes(gene_ids)
    for row in rows:
        for key, gene_id in row.items():
            if key.startswith('geneId') and genes_by_id.get(gene_id):
                row[key.replace('geneId', 'Gene')] = genes_by_id[gene_id]['geneSymbol']

    return create_json_response({'anvilRows': rows})


def _get_over_year_loaded_project_families(projects):
    max_loaded_date = datetime.now() - timedelta(days=365)
    loaded_samples = Sample.objects.filter(
        individual__family__project__in=projects,
        dataset_type=Sample.DATASET_TYPE_VARIANT_CALLS,
        sample_status=Sample.SAMPLE_STATUS_LOADED,
        loaded_date__isnull=False,
        loaded_date__lte=max_loaded_date,
    ).select_related('individual__family__project').order_by('loaded_date')
    return list({sample.individual.family for sample in loaded_samples})


def _get_saved_variants_by_family(projects, user):
    tag_type = VariantTagType.objects.get(name='Known gene for phenotype')

    project_saved_variants = SavedVariant.objects.select_related('family', 'project').filter(
        project__in=projects,
        varianttag__variant_tag_type=tag_type,
    )

    individuals = Individual.objects.filter(family__project__in=projects).only('guid', 'individual_id')
    individual_guids_by_id = {i.individual_id: i.guid for i in individuals}
    project_saved_variants_json = get_json_for_saved_variants(
        project_saved_variants, add_tags=True, add_details=True, user=user, individual_guids_by_id=individual_guids_by_id)

    saved_variants_by_family = defaultdict(list)
    for variant in project_saved_variants_json:
        for family_guid in variant['familyGuids']:
            saved_variants_by_family[family_guid].append(variant)

    return saved_variants_by_family


# HPO categories are direct children of HP:0000118 "Phenotypic abnormality".
# See http://compbio.charite.de/hpoweb/showterm?id=HP:0000118
HPO_CATEGORY_NAMES = {
    'HP:0000478': 'Eye Defects',
    'HP:0025142': 'Constitutional Symptom',
    'HP:0002664': 'Neoplasm',
    'HP:0000818': 'Endocrine System',
    'HP:0000152': 'Head or Neck',
    'HP:0002715': 'Immune System',
    'HP:0001507': 'Growth',
    'HP:0045027': 'Thoracic Cavity',
    'HP:0001871': 'Blood',
    'HP:0002086': 'Respiratory',
    'HP:0000598': 'Ear Defects',
    'HP:0001939': 'Metabolism/Homeostasis',
    'HP:0003549': 'Connective Tissue',
    'HP:0001608': 'Voice',
    'HP:0000707': 'Nervous System',
    'HP:0000769': 'Breast',
    'HP:0001197': 'Prenatal development or birth',
    'HP:0040064': 'Limbs',
    'HP:0025031': 'Abdomen',
    'HP:0003011': 'Musculature',
    'HP:0001626': 'Cardiovascular System',
    'HP:0000924': 'Skeletal System',
    'HP:0500014': 'Test Result',
    'HP:0001574': 'Integument',
    'HP:0000119': 'Genitourinary System',
    'HP:0025354': 'Cellular Phenotype',
}

DEFAULT_ROW = row = {
    "t0": None,
    "t0_copy": None,
    "months_since_t0": None,
    "sample_source": "CMG",
    "analysis_complete_status": "complete",
    "expected_inheritance_model": "multiple",
    "actual_inheritance_model": "",
    "n_kindreds": "1",
    "gene_name": "NS",
    "novel_mendelian_gene": "NS",
    "gene_count": "NA",
    "phenotype_class": "New",
    "solved": "N",
    "genome_wide_linkage": "NS",
    "p_value": "NS",
    "n_kindreds_overlapping_sv_similar_phenotype": "NS",
    "n_unrelated_kindreds_with_causal_variants_in_gene": "NS",
    "biochemical_function": "NS",
    "protein_interaction": "NS",
    "expression": "NS",
    "patient_cells": "NS",
    "non_patient_cell_model": "NS",
    "animal_model": "NS",
    "non_human_cell_culture_model": "NS",
    "rescue": "NS",
    "omim_number_initial": "NA",
    "omim_number_post_discovery": "NA",
    "submitted_to_mme": "NS",
    "posted_publicly": "NS",
    "komp_early_release": "NS",
}
DEFAULT_ROW.update({hpo_category: 'N' for hpo_category in [
    "connective_tissue",
    "voice",
    "nervous_system",
    "breast",
    "eye_defects",
    "prenatal_development_or_birth",
    "neoplasm",
    "endocrine_system",
    "head_or_neck",
    "immune_system",
    "growth",
    "limbs",
    "thoracic_cavity",
    "blood",
    "musculature",
    "cardiovascular_system",
    "abdomen",
    "skeletal_system",
    "respiratory",
    "ear_defects",
    "metabolism_homeostasis",
    "genitourinary_system",
    "integument",
]})

ADDITIONAL_KINDREDS_FIELD = "n_unrelated_kindreds_with_causal_variants_in_gene"
OVERLAPPING_KINDREDS_FIELD = "n_kindreds_overlapping_sv_similar_phenotype"
FUNCTIONAL_DATA_FIELD_MAP = {
    "Additional Unrelated Kindreds w/ Causal Variants in Gene": ADDITIONAL_KINDREDS_FIELD,
    "Genome-wide Linkage": "genome_wide_linkage",
    "Bonferroni corrected p-value": "p_value",
    "Kindreds w/ Overlapping SV & Similar Phenotype": OVERLAPPING_KINDREDS_FIELD,
    "Biochemical Function": "biochemical_function",
    "Protein Interaction": "protein_interaction",
    "Expression": "expression",
    "Patient Cells": "patient_cells",
    "Non-patient cells": "non_patient_cell_model",
    "Animal Model": "animal_model",
    "Non-human cell culture model": "non_human_cell_culture_model",
    "Rescue": "rescue",
}
METADATA_FUNCTIONAL_DATA_FIELDS = {
    "genome_wide_linkage",
    "p_value",
    OVERLAPPING_KINDREDS_FIELD,
    ADDITIONAL_KINDREDS_FIELD,
}


@staff_member_required(login_url=API_LOGIN_REQUIRED_URL)
def get_projects_for_category(request, project_category_name):
    category = ProjectCategory.objects.get(name=project_category_name)
    return create_json_response({
        'projectGuids': [p.guid for p in Project.objects.filter(projectcategory=category).only('guid')],
    })


@staff_member_required(login_url=API_LOGIN_REQUIRED_URL)
def discovery_sheet(request, project_guid):
    errors = []

    project = Project.objects.filter(guid=project_guid).prefetch_related(
        Prefetch('family_set', to_attr='families', queryset=Family.objects.prefetch_related('individual_set'))
    ).distinct().first()
    if not project:
        raise Exception('Invalid project {}'.format(project_guid))

    loaded_samples_by_project_family = _get_loaded_samples_by_project_family([project])
    saved_variants_by_project_family = _get_saved_variants_by_project_family([project])
    rows = _generate_rows(project, loaded_samples_by_project_family, saved_variants_by_project_family, errors)

    return create_json_response({
        'rows': rows,
        'errors': errors,
    })


def _get_loaded_samples_by_project_family(projects):
    loaded_samples = Sample.objects.filter(
        individual__family__project__in=projects,
        dataset_type=Sample.DATASET_TYPE_VARIANT_CALLS,
        sample_status=Sample.SAMPLE_STATUS_LOADED,
        loaded_date__isnull=False
    ).select_related('individual__family__project').order_by('loaded_date')

    loaded_samples_by_project_family = defaultdict(lambda:  defaultdict(list))
    for sample in loaded_samples:
        family = sample.individual.family
        loaded_samples_by_project_family[family.project.guid][family.guid].append(sample)

    return loaded_samples_by_project_family


def _get_saved_variants_by_project_family(projects):
    tag_types = VariantTagType.objects.filter(Q(project__isnull=True) & (Q(category='CMG Discovery Tags') | Q(name='Share with KOMP')))

    project_saved_variants = SavedVariant.objects.select_related('project').select_related('family').prefetch_related(
        Prefetch('varianttag_set', to_attr='discovery_tags',
                 queryset=VariantTag.objects.filter(variant_tag_type__in=tag_types).select_related('variant_tag_type'),
                 )).prefetch_related('variantfunctionaldata_set').filter(
        project__in=projects,
        varianttag__variant_tag_type__in=tag_types,
    )

    saved_variants_by_project_family =  defaultdict(lambda:  defaultdict(list))
    for saved_variant in project_saved_variants:
        saved_variants_by_project_family[saved_variant.project.guid][saved_variant.family.guid].append(saved_variant)

    return saved_variants_by_project_family


def _generate_rows(project, loaded_samples_by_project_family, saved_variants_by_project_family, errors):
    rows = []

    loaded_samples_by_family = loaded_samples_by_project_family[project.guid]
    saved_variants_by_family = saved_variants_by_project_family[project.guid]

    if not loaded_samples_by_family:
        errors.append("No data loaded for project: %s" % project)
        logger.info("No data loaded for project: %s" % project)
        return []

    if "external" in project.name or "reprocessed" in project.name:
        sequencing_approach = "REAN"
    else:
        sequencing_approach = loaded_samples_by_family.values()[0][-1].sample_type

    now = timezone.now()
    for family in project.families:
        samples = loaded_samples_by_family.get(family.guid)
        if not samples:
            errors.append("No data loaded for family: %s. Skipping..." % family)
            continue

        row = {
            "project_guid": project.guid,
            "family_guid": family.guid,
            "family_id": family.family_id,
            "collaborator": project.name,
            "sequencing_approach": sequencing_approach,
            "extras_pedigree_url": family.pedigree_image.url if family.pedigree_image else "",
            "coded_phenotype": family.coded_phenotype or "",
            "pubmed_ids": '; '.join(family.pubmed_ids),
            "analysis_summary": (family.analysis_summary or '').strip('" \n'),
            "row_id": family.guid,
            "num_individuals_sequenced": len({sample.individual for sample in samples})
        }
        row.update(DEFAULT_ROW)

        t0 = samples[0].loaded_date
        t0_diff = rdelta.relativedelta(now, t0)
        t0_months_since_t0 = t0_diff.years * 12 + t0_diff.months
        row.update({
            "t0": t0,
            "t0_copy": t0,
            "months_since_t0": t0_months_since_t0,
        })
        if t0_months_since_t0 < 12:
            row['analysis_complete_status'] = "first_pass_in_progress"

        submitted_to_mme = SEQR_ID_TO_MME_ID_MAP.find_one({'project_id': project.deprecated_project_id, 'family_id': family.family_id})
        if submitted_to_mme:
            row["submitted_to_mme"] = "Y"

        phenotips_individual_data_records = [json.loads(i.phenotips_data) for i in family.individual_set.all() if i.phenotips_data]

        phenotips_individual_expected_inheritance_model = [
            inheritance_mode["label"] for phenotips_data in phenotips_individual_data_records for inheritance_mode in phenotips_data.get("global_mode_of_inheritance", [])
        ]
        if len(phenotips_individual_expected_inheritance_model) == 1:
            row["expected_inheritance_model"] = phenotips_individual_expected_inheritance_model.pop()

        phenotips_individual_mim_disorders = [phenotips_data.get("disorders", []) for phenotips_data in phenotips_individual_data_records]
        omim_number_initial = next((disorder["id"] for disorders in phenotips_individual_mim_disorders for disorder in disorders if "id" in disorder), '').replace("MIM:", "")
        if omim_number_initial:
            row.update({
                "omim_number_initial": omim_number_initial,
                "phenotype_class": "KNOWN",
            })

        if family.post_discovery_omim_number:
            row["omim_number_post_discovery"] = family.post_discovery_omim_number

        phenotips_individual_features = [phenotips_data.get("features", []) for phenotips_data in phenotips_individual_data_records]
        category_not_set_on_some_features = False
        for features_list in phenotips_individual_features:
            for feature in features_list:
                if "category" not in feature:
                    category_not_set_on_some_features = True
                    continue

                if feature["observed"].lower() == "yes":
                    hpo_category_id = feature["category"]
                    hpo_category_name = HPO_CATEGORY_NAMES[hpo_category_id]
                    key = hpo_category_name.lower().replace(" ", "_").replace("/", "_")

                    row[key] = "Y"
                elif feature["observed"].lower() == "no":
                    continue
                else:
                    raise ValueError("Unexpected value for 'observed' in %s" % (feature,))

        if category_not_set_on_some_features:
            errors.append("HPO category field not set for some HPO terms in %s" % family)

        saved_variants = saved_variants_by_family.get(family.guid)
        if not saved_variants:
            rows.append(row)
            continue

        saved_variants_to_json = {}
        for variant in saved_variants:
            if not variant.saved_variant_json:
                errors.append("%s - variant annotation not found" % variant)
                rows.append(row)
                continue

            saved_variant_json = variant_details(json.loads(variant.saved_variant_json), project, user=None)

            if not saved_variant_json['transcripts']:
                errors.append("%s - no gene ids" % variant)
                rows.append(row)
                continue

            saved_variants_to_json[variant] = saved_variant_json

        affected_individual_guids = set()
        unaffected_individual_guids = set()
        for sample in samples:
            if sample.individual.affected == "A":
                affected_individual_guids.add(sample.individual.guid)
            elif sample.individual.affected == "N":
                unaffected_individual_guids.add(sample.individual.guid)

        potential_compound_het_genes = defaultdict(set)
        for variant, saved_variant_json in saved_variants_to_json.items():
            inheritance_models = set()

            affected_indivs_with_hom_alt_variants = set()
            affected_indivs_with_het_variants = set()
            unaffected_indivs_with_hom_alt_variants = set()
            unaffected_indivs_with_het_variants = set()
            is_x_linked = False

            genotypes = saved_variant_json.get('genotypes')
            if genotypes:
                chrom = saved_variant_json['chrom']
                is_x_linked = "X" in chrom
                for sample_guid, genotype in genotypes.items():
                    if genotype["numAlt"] == 2 and sample_guid in affected_individual_guids:
                        affected_indivs_with_hom_alt_variants.add(sample_guid)
                    elif genotype["numAlt"] == 1 and sample_guid in affected_individual_guids:
                        affected_indivs_with_het_variants.add(sample_guid)
                    elif genotype["numAlt"] == 2 and sample_guid in unaffected_individual_guids:
                        unaffected_indivs_with_hom_alt_variants.add(sample_guid)
                    elif genotype["numAlt"] == 1 and sample_guid in unaffected_individual_guids:
                        unaffected_indivs_with_het_variants.add(sample_guid)

            # AR-homozygote, AR-comphet, AR, AD, de novo, X-linked, UPD, other, multiple
            if not unaffected_indivs_with_hom_alt_variants and affected_indivs_with_hom_alt_variants:
                if is_x_linked:
                    inheritance_models.add("X-linked")
                else:
                    inheritance_models.add("AR-homozygote")

            if not unaffected_indivs_with_hom_alt_variants and not unaffected_indivs_with_het_variants and affected_indivs_with_het_variants:
                if unaffected_individual_guids:
                    inheritance_models.add("de novo")
                else:
                    inheritance_models.add("AD")

            if not unaffected_indivs_with_hom_alt_variants and (len(
                    unaffected_individual_guids) < 2 or unaffected_indivs_with_het_variants) and affected_indivs_with_het_variants and not affected_indivs_with_hom_alt_variants:
                for gene_id in saved_variant_json['transcripts']:
                    potential_compound_het_genes[gene_id].add(variant)

            saved_variant_json['inheritance'] = inheritance_models

        gene_ids_to_saved_variants = defaultdict(set)
        gene_ids_to_variant_tag_names = defaultdict(set)
        gene_ids_to_inheritance = defaultdict(set)
        # Compound het variants are reported in the gene that they share
        for gene_id, variants in potential_compound_het_genes.items():
            if len(variants) > 1:
                gene_ids_to_inheritance[gene_id].add("AR-comphet")
                # Only include compound hets for one of the genes they are both in
                existing_gene_id = next((
                    existing_gene_id for existing_gene_id, existing_variants in gene_ids_to_saved_variants.items()
                    if existing_variants == variants), None)
                if existing_gene_id:
                    main_gene_ids = {
                        saved_variants_to_json[variant]['mainTranscript']['geneId'] for variant in variants
                    }
                    if gene_id in main_gene_ids:
                        gene_ids_to_saved_variants[gene_id] = gene_ids_to_saved_variants[existing_gene_id]
                        del gene_ids_to_saved_variants[existing_gene_id]
                        gene_ids_to_variant_tag_names[gene_id] = gene_ids_to_variant_tag_names[existing_gene_id]
                        del gene_ids_to_variant_tag_names[existing_gene_id]
                else:
                    for variant in variants:
                        saved_variants_to_json[variant]['inheritance'] = {"AR-comphet"}
                        gene_ids_to_variant_tag_names[gene_id].update(
                            {vt.variant_tag_type.name for vt in variant.discovery_tags})
                    gene_ids_to_saved_variants[gene_id].update(variants)

        # Non-compound het variants are reported in the main transcript gene
        for variant, saved_variant_json in saved_variants_to_json.items():
            if "AR-comphet" not in saved_variant_json['inheritance']:
                gene_id = saved_variant_json['mainTranscript']['geneId']
                gene_ids_to_saved_variants[gene_id].add(variant)
                gene_ids_to_variant_tag_names[gene_id].update({vt.variant_tag_type.name for vt in variant.discovery_tags})
                gene_ids_to_inheritance[gene_id].update(saved_variant_json['inheritance'])

        if len(gene_ids_to_saved_variants) > 1:
            row["gene_count"] = len(gene_ids_to_saved_variants)

        for gene_id, variants in gene_ids_to_saved_variants.items():
            # create a copy of the row dict
            row = dict(row)

            row["actual_inheritance_model"] = ", ".join(gene_ids_to_inheritance[gene_id])

            row["gene_id"] = gene_id
            row["row_id"] += gene_id

            variant_tag_names = gene_ids_to_variant_tag_names[gene_id]

            has_tier1 = any(name.startswith("Tier 1") for name in variant_tag_names)
            has_tier2 = any(name.startswith("Tier 2") for name in variant_tag_names)
            has_known_gene_for_phenotype = 'Known gene for phenotype' in variant_tag_names

            row.update({
                "solved": ("TIER 1 GENE" if (has_tier1 or has_known_gene_for_phenotype) else (
                    "TIER 2 GENE" if has_tier2 else "N")),
                "komp_early_release": "Y" if 'Share with KOMP' in variant_tag_names else "N",
            })

            if has_tier1 or has_tier2 or has_known_gene_for_phenotype:
                row.update({
                    "posted_publicly":  "",
                    "analysis_complete_status": "complete",
                    "novel_mendelian_gene":  "Y" if any("Novel gene" in name for name in variant_tag_names) else "N",
                })

                if has_known_gene_for_phenotype:
                    row["phenotype_class"] = "KNOWN"
                elif any(tag in variant_tag_names for tag in [
                    'Tier 1 - Known gene, new phenotype', 'Tier 2 - Known gene, new phenotype',
                ]):
                    row["phenotype_class"] = "NEW"
                elif any(tag in variant_tag_names for tag in [
                    'Tier 1 - Phenotype expansion', 'Tier 1 - Novel mode of inheritance',  'Tier 2 - Phenotype expansion',
                ]):
                    row["phenotype_class"] = "EXPAN"
                elif any(tag in variant_tag_names for tag in [
                    'Tier 1 - Phenotype not delineated', 'Tier 2 - Phenotype not delineated'
                ]):
                    row["phenotype_class"] = "UE"

            if not submitted_to_mme:
                if has_tier1 or has_tier2:
                    row["submitted_to_mme"] = "N" if t0_months_since_t0 > 7 else "TBD"
                elif has_known_gene_for_phenotype:
                    row["submitted_to_mme"] = "KPG"

            if has_tier1 or has_tier2:
                # Set defaults
                for functional_field in FUNCTIONAL_DATA_FIELD_MAP.values():
                    if functional_field == ADDITIONAL_KINDREDS_FIELD:
                        row[functional_field] = "1"
                    elif functional_field in METADATA_FUNCTIONAL_DATA_FIELDS:
                        row[functional_field] = "NA"
                    else:
                        row[functional_field] = "N"
                # Set values
                for variant in variants:
                    for f in variant.variantfunctionaldata_set.all():
                        functional_field = FUNCTIONAL_DATA_FIELD_MAP[f.functional_data_tag]
                        if functional_field in METADATA_FUNCTIONAL_DATA_FIELDS:
                            value = f.metadata
                            if functional_field == ADDITIONAL_KINDREDS_FIELD:
                                value = str(int(value) + 1)
                            elif functional_field == OVERLAPPING_KINDREDS_FIELD:
                                existing_val = row[functional_field]
                                if existing_val != 'NA':
                                    value = str(max(int(existing_val), int(value)))
                            elif row[functional_field] != 'NS':
                                value = '{} {}'.format(row[functional_field], value)
                        else:
                            value = 'Y'

                        row[functional_field] = value
            elif has_known_gene_for_phenotype:
                for functional_field in FUNCTIONAL_DATA_FIELD_MAP.values():
                    row[functional_field] = "KPG"

            row["extras_variant_tag_list"] = []
            for variant in variants:
                variant_id = "-".join(map(str, list(get_chrom_pos(variant.xpos_start)) + [variant.ref, variant.alt]))
                row["extras_variant_tag_list"] += [
                    (variant_id, gene_id, vt.variant_tag_type.name.lower()) for vt in variant.discovery_tags
                ]

            rows.append(row)

    _update_gene_symbols(rows)
    _update_initial_omim_numbers(rows)

    return rows


def _update_gene_symbols(rows):
    genes_by_id = get_genes({row['gene_id'] for row in rows if row.get('gene_id')})
    for row in rows:
        if row.get('gene_id') and genes_by_id.get(row['gene_id']):
            row['gene_name'] = genes_by_id[row['gene_id']]['geneSymbol']

        row["extras_variant_tag_list"] = ["{variant_id}  {gene_symbol}  {tag}".format(
            variant_id=variant_id, gene_symbol=genes_by_id.get(gene_id, {}).get('geneSymbol'), tag=tag,
        ) for variant_id, gene_id, tag in row.get("extras_variant_tag_list", [])]


def _update_initial_omim_numbers(rows):
    omim_numbers = {row['omim_number_initial'] for row in rows if row['omim_number_initial'] and row['omim_number_initial'] != 'NA'}

    omim_number_map = {str(omim.phenotype_mim_number): omim.phenotypic_series_number
                       for omim in Omim.objects.filter(phenotype_mim_number__in=omim_numbers, phenotypic_series_number__isnull=False)}

    for mim_number, phenotypic_series_number in omim_number_map.items():
        logger.info("Will replace OMIM initial # %s with phenotypic series %s" % (mim_number, phenotypic_series_number))

    for row in rows:
        if omim_number_map.get(row['omim_number_initial']):
            row['omim_number_initial'] = omim_number_map[row['omim_number_initial']]
