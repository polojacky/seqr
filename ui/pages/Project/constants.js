/* eslint-disable no-multi-spaces */

import orderBy from 'lodash/orderBy'

import { RadioGroup } from 'shared/components/form/Inputs'
import { hasPhenotipsDetails } from 'shared/components/panel/view-phenotips-info/PhenotipsDataPanel'
import { stripMarkdown } from 'shared/utils/stringUtils'
import {
  FAMILY_STATUS_SOLVED,
  FAMILY_STATUS_SOLVED_KNOWN_GENE_KNOWN_PHENOTYPE,
  FAMILY_STATUS_SOLVED_KNOWN_GENE_DIFFERENT_PHENOTYPE,
  FAMILY_STATUS_SOLVED_NOVEL_GENE,
  FAMILY_STATUS_STRONG_CANDIDATE_KNOWN_GENE_KNOWN_PHENOTYPE,
  FAMILY_STATUS_STRONG_CANDIDATE_KNOWN_GENE_DIFFERENT_PHENOTYPE,
  FAMILY_STATUS_STRONG_CANDIDATE_NOVEL_GENE,
  FAMILY_STATUS_REVIEWED_PURSUING_CANDIDATES,
  FAMILY_STATUS_REVIEWED_NO_CLEAR_CANDIDATE,
  FAMILY_STATUS_ANALYSIS_IN_PROGRESS,
  FAMILY_FIELD_ID,
  FAMILY_DISPLAY_NAME,
  FAMILY_FIELD_DESCRIPTION,
  FAMILY_FIELD_ANALYSIS_STATUS,
  FAMILY_FIELD_ANALYSED_BY,
  FAMILY_FIELD_ANALYSIS_NOTES,
  FAMILY_FIELD_ANALYSIS_SUMMARY,
  FAMILY_FIELD_INTERNAL_NOTES,
  FAMILY_FIELD_INTERNAL_SUMMARY,
  FAMILY_FIELD_FIRST_SAMPLE,
  FAMILY_FIELD_CREATED_DATE,
  CLINSIG_SEVERITY,
  FAMILY_ANALYSIS_STATUS_OPTIONS,
  SAMPLE_STATUS_LOADED,
  DATASET_TYPE_VARIANT_CALLS,
  SEX_LOOKUP,
  SEX_OPTIONS,
  AFFECTED_LOOKUP,
  AFFECTED_OPTIONS,
} from 'shared/utils/constants'

export const CASE_REVIEW_TABLE_NAME = 'Case Review'

export const CASE_REVIEW_STATUS_IN_REVIEW = 'I'
export const CASE_REVIEW_STATUS_UNCERTAIN = 'U'
export const CASE_REVIEW_STATUS_ACCEPTED = 'A'
export const CASE_REVIEW_STATUS_NOT_ACCEPTED = 'R'
export const CASE_REVIEW_STATUS_MORE_INFO_NEEDED = 'Q'
export const CASE_REVIEW_STATUS_PENDING_RESULTS_AND_RECORDS = 'P'
export const CASE_REVIEW_STATUS_WAITLIST = 'W'

export const CASE_REVIEW_STATUS_OPTIONS = [
  { value: CASE_REVIEW_STATUS_IN_REVIEW,                   name: 'In Review',             color: '#2196F3' },
  { value: CASE_REVIEW_STATUS_UNCERTAIN,                   name: 'Uncertain',             color: '#fddb28' },
  { value: CASE_REVIEW_STATUS_ACCEPTED,                    name: 'Accepted',              color: '#8BC34A' },
  { value: CASE_REVIEW_STATUS_NOT_ACCEPTED,                name: 'Not Accepted',          color: '#4f5cb3' },  //#C5CAE9
  { value: CASE_REVIEW_STATUS_MORE_INFO_NEEDED,            name: 'More Info Needed',      color: '#F44336' },  //#673AB7
  { value: CASE_REVIEW_STATUS_PENDING_RESULTS_AND_RECORDS, name: 'Pending Results and Records', color: '#996699' },
  { value: CASE_REVIEW_STATUS_WAITLIST,                    name: 'Waitlist',              color: '#990099' },
]

export const CASE_REVIEW_STATUS_OPT_LOOKUP = CASE_REVIEW_STATUS_OPTIONS.reduce(
  (acc, opt) => ({
    ...acc,
    ...{ [opt.value]: opt },
  }), {},
)

export const SHOW_ALL = 'ALL'

export const SHOW_IN_REVIEW = 'IN_REVIEW'
export const SHOW_ACCEPTED = 'ACCEPTED'
export const SHOW_NOT_ACCEPTED = 'NOT_ACCEPTED'
export const SHOW_UNCERTAIN = 'UNCERTAIN'
export const SHOW_MORE_INFO_NEEDED = 'MORE_INFO_NEEDED'

export const SHOW_SOLVED = 'SHOW_SOLVED'
export const SHOW_STRONG_CANDIDATE = 'SHOW_STRONG_CANDIDATE'
export const SHOW_REVIEWED_NO_CLEAR_CANDIDATE = 'SHOW_REVIEWED_NO_CLEAR_CANDIDATE'
export const SHOW_ANALYSIS_IN_PROGRESS = 'SHOW_ANALYSIS_IN_PROGRESS'

export const SHOW_NOT_IN_REVIEW = 'NOT_IN_REVIEW'
export const SHOW_PENDING_RESULTS_AND_RECORDS = 'PENDING_RESULTS_AND_RECORDS'
export const SHOW_WAITLIST = 'WAITLIST'
export const SHOW_WITHDREW = 'WITHDREW'
export const SHOW_INELIGIBLE = 'INELIGIBLE'
export const SHOW_DECLINED_TO_PARTICIPATE = 'DECLINED_TO_PARTICIPATE'

export const SHOW_DATA_LOADED = 'SHOW_DATA_LOADED'
export const SHOW_PHENOTYPES_ENTERED = 'SHOW_PHENOTYPES_ENTERED'
export const SHOW_NO_PHENOTYPES_ENTERED = 'SHOW_NO_PHENOTYPES_ENTERED'

export const SHOW_ANALYSED_BY_ME = 'SHOW_ANALYSED_BY_ME'
export const SHOW_NOT_ANALYSED_BY_ME = 'SHOW_NOT_ANALYSED_BY_ME'
export const SHOW_ANALYSED_BY_CMG = 'SHOW_ANALYSED_BY_CMG'
export const SHOW_NOT_ANALYSED_BY_CMG = 'SHOW_NOT_ANALYSED_BY_CMG'
export const SHOW_ANALYSED = 'SHOW_ANALYSED'
export const SHOW_NOT_ANALYSED = 'SHOW_NOT_ANALYSED'


const SOLVED_STATUSES = new Set([
  FAMILY_STATUS_SOLVED,
  FAMILY_STATUS_SOLVED_KNOWN_GENE_KNOWN_PHENOTYPE,
  FAMILY_STATUS_SOLVED_KNOWN_GENE_DIFFERENT_PHENOTYPE,
  FAMILY_STATUS_SOLVED_NOVEL_GENE,
])

const STRONG_CANDIDATE_STATUSES = new Set([
  FAMILY_STATUS_STRONG_CANDIDATE_KNOWN_GENE_KNOWN_PHENOTYPE,
  FAMILY_STATUS_STRONG_CANDIDATE_KNOWN_GENE_DIFFERENT_PHENOTYPE,
  FAMILY_STATUS_STRONG_CANDIDATE_NOVEL_GENE,
])

const ANALYSIS_IN_PROGRESS_STATUSES = new Set([
  FAMILY_STATUS_ANALYSIS_IN_PROGRESS,
  FAMILY_STATUS_REVIEWED_PURSUING_CANDIDATES,
])

const caseReviewStatusFilter = status => individualsByGuid => family =>
  family.individualGuids.map(individualGuid => individualsByGuid[individualGuid]).some(
    individual => individual.caseReviewStatus === status,
  )

export const familySamplesLoaded = (family, individualsByGuid, samplesByGuid) => {
  const loadedSamples = [...family.individualGuids.map(individualGuid => individualsByGuid[individualGuid]).reduce(
    (acc, individual) => new Set([...acc, ...individual.sampleGuids]), new Set(),
  )].map(sampleGuid => samplesByGuid[sampleGuid]).filter(sample =>
    sample.datasetType === DATASET_TYPE_VARIANT_CALLS &&
    sample.sampleStatus === SAMPLE_STATUS_LOADED &&
    sample.loadedDate,
  )
  return orderBy(loadedSamples, [s => s.loadedDate], 'asc')
}

export const FAMILY_FILTER_OPTIONS = [
  {
    value: SHOW_ALL,
    name: 'All',
    createFilter: () => () => (true),
  },
  {
    value: SHOW_DATA_LOADED,
    category: 'Data Status:',
    name: 'Data Loaded',
    internalOmit: true,
    createFilter: (individualsByGuid, samplesByGuid) => family =>
      familySamplesLoaded(family, individualsByGuid, samplesByGuid).length > 0,
  },
  {
    value: SHOW_PHENOTYPES_ENTERED,
    category: 'Data Status:',
    name: 'Phenotypes Entered',
    internalOmit: true,
    createFilter: individualsByGuid => family =>
      family.individualGuids.map(individualGuid => individualsByGuid[individualGuid].phenotipsData).some(
        phenotipsData => hasPhenotipsDetails(phenotipsData),
      ),
  },
  {
    value: SHOW_NO_PHENOTYPES_ENTERED,
    category: 'Data Status:',
    name: 'No Phenotypes Entered',
    internalOmit: true,
    createFilter: individualsByGuid => family =>
      family.individualGuids.map(individualGuid => individualsByGuid[individualGuid].phenotipsData).every(
        phenotipsData => !hasPhenotipsDetails(phenotipsData),
      ),
  },
  {
    value: SHOW_ANALYSED_BY_ME,
    category: 'Analysed By:',
    name: 'Analysed By Me',
    internalOmit: true,
    createFilter: (individualsByGuid, samplesByGuid, user) => family =>
      family.analysedBy.map(analysedBy => analysedBy.createdBy.email).includes(user.email),
  },
  {
    value: SHOW_NOT_ANALYSED_BY_ME,
    category: 'Analysed By:',
    name: 'Not Analysed By Me',
    internalOmit: true,
    createFilter: (individualsByGuid, samplesByGuid, user) => family =>
      !family.analysedBy.map(analysedBy => analysedBy.createdBy.email).includes(user.email),
  },
  {
    value: SHOW_ANALYSED_BY_CMG,
    category: 'Analysed By:',
    name: 'Analysed By CMG',
    internalOmit: true,
    createFilter: () => family =>
      family.analysedBy.some(analysedBy => analysedBy.createdBy.isStaff),
  },
  {
    value: SHOW_NOT_ANALYSED_BY_CMG,
    category: 'Analysed By:',
    name: 'Not Analysed By CMG',
    internalOmit: true,
    createFilter: () => family =>
      family.analysedBy.every(analysedBy => !analysedBy.createdBy.isStaff),
  },
  {
    value: SHOW_ANALYSED,
    category: 'Analysed By:',
    name: 'Analysed',
    internalOmit: true,
    createFilter: () => family => family.analysedBy.length > 0,
  },
  {
    value: SHOW_NOT_ANALYSED,
    category: 'Analysed By:',
    name: 'Not Analysed',
    internalOmit: true,
    createFilter: () => family => family.analysedBy.length < 1,
  },
  {
    value: SHOW_SOLVED,
    category: 'Analysis Status:',
    name: 'Solved',
    internalOmit: true,
    createFilter: () => family =>
      SOLVED_STATUSES.has(family.analysisStatus),
  },
  {
    value: SHOW_STRONG_CANDIDATE,
    category: 'Analysis Status:',
    name: 'Strong Candidate',
    internalOmit: true,
    createFilter: () => family =>
      STRONG_CANDIDATE_STATUSES.has(family.analysisStatus),
  },
  {
    value: SHOW_REVIEWED_NO_CLEAR_CANDIDATE,
    category: 'Analysis Status:',
    name: 'No Clear Candidate',
    internalOmit: true,
    createFilter: () => family => family.analysisStatus === FAMILY_STATUS_REVIEWED_NO_CLEAR_CANDIDATE,
  },
  {
    value: SHOW_ANALYSIS_IN_PROGRESS,
    category: 'Analysis Status:',
    name: 'Analysis In Progress',
    internalOmit: true,
    createFilter: () => family =>
      ANALYSIS_IN_PROGRESS_STATUSES.has(family.analysisStatus),
  },
  {
    value: SHOW_ACCEPTED,
    category: 'Analysis Status:',
    name: 'Accepted',
    createFilter: caseReviewStatusFilter(CASE_REVIEW_STATUS_ACCEPTED),
  },
  {
    value: SHOW_NOT_ACCEPTED,
    category: 'Analysis Status:',
    name: 'Not Accepted',
    internalOnly: true,
    createFilter: caseReviewStatusFilter(CASE_REVIEW_STATUS_NOT_ACCEPTED),
  },
  {
    value: SHOW_IN_REVIEW,
    category: 'Analysis Status:',
    name: 'In Review',
    createFilter: individualsByGuid => family =>
      family.individualGuids.map(individualGuid => individualsByGuid[individualGuid]).every(
        individual => individual.caseReviewStatus === CASE_REVIEW_STATUS_IN_REVIEW,
      ),
  },
  {
    value: SHOW_UNCERTAIN,
    category: 'Analysis Status:',
    name: 'Uncertain',
    internalOnly: true,
    createFilter: caseReviewStatusFilter(CASE_REVIEW_STATUS_UNCERTAIN),
  },
  {
    value: SHOW_MORE_INFO_NEEDED,
    category: 'Analysis Status:',
    name: 'More Info Needed',
    internalOnly: true,
    createFilter: caseReviewStatusFilter(CASE_REVIEW_STATUS_MORE_INFO_NEEDED),
  },
  {
    value: SHOW_PENDING_RESULTS_AND_RECORDS,
    category: 'Analysis Status:',
    name: 'Pending Results and Records',
    internalOnly: true,
    createFilter: caseReviewStatusFilter(CASE_REVIEW_STATUS_PENDING_RESULTS_AND_RECORDS),
  },
  {
    value: SHOW_WAITLIST,
    category: 'Analysis Status:',
    name: 'Waitlist',
    internalOnly: true,
    createFilter: caseReviewStatusFilter(CASE_REVIEW_STATUS_WAITLIST),
  },
]

export const FAMILY_FILTER_LOOKUP = FAMILY_FILTER_OPTIONS.reduce(
  (acc, opt) => ({
    ...acc,
    [opt.value]: opt,
  }), {},
)


export const SORT_BY_FAMILY_NAME = 'FAMILY_NAME'
export const SORT_BY_FAMILY_ADDED_DATE = 'FAMILY_ADDED_DATE'
export const SORT_BY_DATA_LOADED_DATE = 'DATA_LOADED_DATE'
export const SORT_BY_DATA_FIRST_LOADED_DATE = 'DATA_FIRST_LOADED_DATE'
export const SORT_BY_REVIEW_STATUS_CHANGED_DATE = 'REVIEW_STATUS_CHANGED_DATE'
export const SORT_BY_ANALYSIS_STATUS = 'SORT_BY_ANALYSIS_STATUS'

export const FAMILY_SORT_OPTIONS = [
  {
    value: SORT_BY_FAMILY_NAME,
    name: 'Family Name',
    createSortKeyGetter: () => family => family.displayName,
  },
  {
    value: SORT_BY_FAMILY_ADDED_DATE,
    name: 'Date Added',
    createSortKeyGetter: individualsByGuid => family =>
      family.individualGuids.map(individualGuid => individualsByGuid[individualGuid]).reduce(
        (acc, individual) => {
          const indivCreatedDate = individual.createdDate || '2000-01-01T01:00:00.000Z'
          return indivCreatedDate > acc ? indivCreatedDate : acc
        },
        '2000-01-01T01:00:00.000Z',
      ),
  },
  {
    value: SORT_BY_DATA_LOADED_DATE,
    name: 'Date Loaded',
    createSortKeyGetter: (individualsByGuid, samplesByGuid) => (family) => {
      const loadedSamples = familySamplesLoaded(family, individualsByGuid, samplesByGuid)
      return loadedSamples.length ? loadedSamples[loadedSamples.length - 1].loadedDate : '2000-01-01T01:00:00.000Z'
    },
  },
  {
    value: SORT_BY_DATA_FIRST_LOADED_DATE,
    name: 'Date First Loaded',
    createSortKeyGetter: (individualsByGuid, samplesByGuid) => (family) => {
      const loadedSamples = familySamplesLoaded(family, individualsByGuid, samplesByGuid)
      return loadedSamples.length ? loadedSamples[0].loadedDate : '2000-01-01T01:00:00.000Z'
    },
  },
  {
    value: SORT_BY_ANALYSIS_STATUS,
    name: 'Analysis Status',
    createSortKeyGetter: () => family =>
      FAMILY_ANALYSIS_STATUS_OPTIONS.map(status => status.value).indexOf(family.analysisStatus),
  },
  {
    value: SORT_BY_REVIEW_STATUS_CHANGED_DATE,
    name: 'Date Review Status Changed',
    createSortKeyGetter: individualsByGuid => family =>
      family.individualGuids.map(individualGuid => individualsByGuid[individualGuid]).reduce(
        (acc, individual) => {
          const indivCaseReviewStatusLastModifiedDate = individual.caseReviewStatusLastModifiedDate || '2000-01-01T01:00:00.000Z'
          return indivCaseReviewStatusLastModifiedDate > acc ? indivCaseReviewStatusLastModifiedDate : acc
        },
        '2000-01-01T01:00:00.000Z',
      ),
  },
]

const exportConfigForField = fieldConfigs => (field) => {
  const  { label, format, description } = fieldConfigs[field]
  return { field,  header: label, format, description }
}

const tableConfigForField = fieldConfigs => (field) => {
  const  { label, width, formFieldProps = {} } = fieldConfigs[field]
  return { name: field,  content: label, width, formFieldProps }
}

const FAMILY_FIELD_CONFIGS = {
  [FAMILY_FIELD_ID]: { label: 'Family ID', width: 3 },
  [FAMILY_DISPLAY_NAME]: { label: 'Display Name', width: 3 },
  [FAMILY_FIELD_CREATED_DATE]: { label: 'Created Date' },
  [FAMILY_FIELD_FIRST_SAMPLE]: { label: 'First Data Loaded Date', format: firstSample => (firstSample || {}).loadedDate },
  [FAMILY_FIELD_DESCRIPTION]: { label: 'Description', format: stripMarkdown, width: 10 },
  [FAMILY_FIELD_ANALYSIS_STATUS]: {
    label: 'Analysis Status',
    format: status => (FAMILY_ANALYSIS_STATUS_OPTIONS.find(option => option.value === status) || {}).name,
  },
  [FAMILY_FIELD_ANALYSED_BY]: { label: 'Analysed By', format: analysedBy => analysedBy.map(o => o.createdBy.fullName || o.createdBy.email).join(',') },
  [FAMILY_FIELD_ANALYSIS_SUMMARY]: { label: 'Analysis Summary', format: stripMarkdown },
  [FAMILY_FIELD_ANALYSIS_NOTES]: { label: 'Analysis Notes', format: stripMarkdown },
}

export const FAMILY_FIELDS = [
  FAMILY_FIELD_ID, FAMILY_DISPLAY_NAME, FAMILY_FIELD_DESCRIPTION,
].map(tableConfigForField(FAMILY_FIELD_CONFIGS))

export const FAMILY_EXPORT_DATA = [
  FAMILY_FIELD_ID,
  FAMILY_DISPLAY_NAME,
  FAMILY_FIELD_CREATED_DATE,
  FAMILY_FIELD_FIRST_SAMPLE,
  FAMILY_FIELD_DESCRIPTION,
  FAMILY_FIELD_ANALYSIS_STATUS,
  FAMILY_FIELD_ANALYSED_BY,
  FAMILY_FIELD_ANALYSIS_SUMMARY,
  FAMILY_FIELD_ANALYSIS_NOTES,
].map(exportConfigForField(FAMILY_FIELD_CONFIGS))

export const INTERNAL_FAMILY_EXPORT_DATA = [
  { header: 'Internal Case Review Summary', field: FAMILY_FIELD_INTERNAL_SUMMARY, format: stripMarkdown },
  { header: 'Internal Case Review Notes', field: FAMILY_FIELD_INTERNAL_NOTES, format: stripMarkdown },
]

const INDIVIDUAL_FIELD_ID = 'individualId'
const INDIVIDUAL_FIELD_PATERNAL_ID = 'paternalId'
const INDIVIDUAL_FIELD_MATERNAL_ID = 'maternalId'
const INDIVIDUAL_FIELD_SEX = 'sex'
const INDIVIDUAL_FIELD_AFFECTED = 'affected'
const INDIVIDUAL_FIELD_NOTES = 'notes'

const INDIVIDUAL_FIELD_CONFIGS = {
  [FAMILY_FIELD_ID]: { label: 'Family ID' },
  [INDIVIDUAL_FIELD_ID]: { label: 'Individual ID' },
  [INDIVIDUAL_FIELD_PATERNAL_ID]: { label: 'Paternal ID', description: 'Individual ID of the father' },
  [INDIVIDUAL_FIELD_MATERNAL_ID]: { label: 'Maternal ID', description: 'Individual ID of the mother' },
  [INDIVIDUAL_FIELD_SEX]: {
    label: 'Sex',
    format: sex => SEX_LOOKUP[sex],
    width: 3,
    description: 'Male or Female, leave blank if unknown',
    formFieldProps: { component: RadioGroup, options: SEX_OPTIONS },
  },
  [INDIVIDUAL_FIELD_AFFECTED]: {
    label: 'Affected Status',
    format: affected => AFFECTED_LOOKUP[affected],
    width: 4,
    description: 'Affected or Unaffected, leave blank if unknown',
    formFieldProps: { component: RadioGroup, options: AFFECTED_OPTIONS },
  },
  [INDIVIDUAL_FIELD_NOTES]: { label: 'Notes', format: stripMarkdown, description: 'free-text notes related to this individual'  },
}

export const INDIVIDUAL_FIELDS = [
  FAMILY_FIELD_ID,
  INDIVIDUAL_FIELD_ID,
  INDIVIDUAL_FIELD_PATERNAL_ID,
  INDIVIDUAL_FIELD_MATERNAL_ID,
  INDIVIDUAL_FIELD_SEX,
  INDIVIDUAL_FIELD_AFFECTED,
].map(tableConfigForField(INDIVIDUAL_FIELD_CONFIGS))

export const INDIVIDUAL_ID_EXPORT_DATA = [
  FAMILY_FIELD_ID, INDIVIDUAL_FIELD_ID,
].map(exportConfigForField(INDIVIDUAL_FIELD_CONFIGS))

export const INDIVIDUAL_CORE_EXPORT_DATA = [
  INDIVIDUAL_FIELD_PATERNAL_ID,
  INDIVIDUAL_FIELD_MATERNAL_ID,
  INDIVIDUAL_FIELD_SEX,
  INDIVIDUAL_FIELD_AFFECTED,
  INDIVIDUAL_FIELD_NOTES,
].map(exportConfigForField(INDIVIDUAL_FIELD_CONFIGS))

export const INDIVIDUAL_HPO_EXPORT_DATA = [
  {
    header: 'HPO Terms (present)',
    field: 'phenotipsData',
    format: phenotipsData => (
      (phenotipsData || {}).features ?
        phenotipsData.features.filter(feature => feature.observed === 'yes').map(feature => `${feature.id} (${feature.label})`).join('; ') :
        ''
    ),
    description: 'comma-separated list of HPO Terms for present phenotypes in this individual',
  },
  {
    header: 'HPO Terms (absent)',
    field: 'phenotipsData',
    format: phenotipsData => (
      (phenotipsData || {}).features ?
        phenotipsData.features.filter(feature => feature.observed === 'no').map(feature => `${feature.id} (${feature.label})`).join('; ') :
        ''
    ),
    description: 'comma-separated list of HPO Terms for phenotypes not present in this individual',
  },
]

export const INDIVIDUAL_EXPORT_DATA = [].concat(INDIVIDUAL_ID_EXPORT_DATA, INDIVIDUAL_CORE_EXPORT_DATA, INDIVIDUAL_HPO_EXPORT_DATA)


export const INTERNAL_INDIVIDUAL_EXPORT_DATA = [
  { header: 'Case Review Status', field: 'caseReviewStatus', format: status => CASE_REVIEW_STATUS_OPT_LOOKUP[status].name },
  { header: 'Case Review Status Last Modified', field: 'caseReviewStatusLastModifiedDate' },
  { header: 'Case Review Status Last Modified By', field: 'caseReviewStatusLastModifiedBy' },
  { header: 'Case Review Discussion', field: 'caseReviewDiscussion', format: stripMarkdown },
]

export const SAMPLE_EXPORT_DATA = [
  { header: 'Family ID', field: 'familyId' },
  { header: 'Individual ID', field: 'individualId' },
  { header: 'Sample ID', field: 'sampleId' },
  { header: 'Loaded Date', field: 'loadedDate' },
  { header: 'Sample Type', field: 'sampleType' },
]

export const SORT_BY_FAMILY_GUID = 'FAMILY_GUID'
export const SORT_BY_XPOS = 'XPOS'
export const SORT_BY_PATHOGENICITY = 'PATHOGENICITY'
export const SORT_BY_IN_OMIM = 'IN_OMIM'

const clinsigSeverity = (variant) => {
  const clinvarSignificance = variant.clinvar.clinsig && variant.clinvar.clinsig.split('/')[0]
  const hgmdSignificance = variant.hgmd.class
  if (!clinvarSignificance && !hgmdSignificance) return -10
  let clinvarSeverity = 0.1
  if (clinvarSignificance) {
    clinvarSeverity = clinvarSignificance in CLINSIG_SEVERITY ? CLINSIG_SEVERITY[clinvarSignificance] + 1 : 0.5
  }
  const hgmdSeverity = hgmdSignificance in CLINSIG_SEVERITY ? CLINSIG_SEVERITY[hgmdSignificance] + 0.5 : 0
  return clinvarSeverity + hgmdSeverity
}

export const VARIANT_SORT_OPTONS = [
  { value: SORT_BY_FAMILY_GUID, text: 'Family', comparator: (a, b) => a.familyGuid.localeCompare(b.familyGuid) },
  { value: SORT_BY_XPOS, text: 'Position', comparator: (a, b) => a.xpos - b.xpos },
  { value: SORT_BY_PATHOGENICITY, text: 'Pathogenicity', comparator: (a, b) => clinsigSeverity(b) - clinsigSeverity(a) },
  {
    value: SORT_BY_IN_OMIM,
    text: 'In OMIM',
    comparator: (a, b, genesById) =>
      (genesById[b.mainTranscript.geneId] || { omimPhenotypes: [] }).omimPhenotypes.length - (genesById[a.mainTranscript.geneId] || { omimPhenotypes: [] }).omimPhenotypes.length,
  },
]

export const VARIANT_EXPORT_DATA = [
  { header: 'chrom' },
  { header: 'pos' },
  { header: 'ref' },
  { header: 'alt' },
  { header: 'tags', getVal: variant => variant.tags.map(tag => tag.name).join('|') },
  { header: 'notes', getVal: variant => variant.notes.map(note => `${note.user}: ${note.note}`).join('|') },
  { header: 'family', getVal: variant => variant.familyGuid.split(/_(.+)/)[1] },
  { header: 'gene', getVal: variant => variant.mainTranscript.symbol },
  { header: 'consequence', getVal: variant => variant.annotation.vepConsequence },
  { header: '1kg_freq', getVal: variant => variant.annotation.freqs.g1k },
  { header: 'exac_freq', getVal: variant => variant.annotation.freqs.exac },
  { header: 'sift', getVal: variant => variant.annotation.sift },
  { header: 'polyphen', getVal: variant => variant.annotation.polyphen },
  { header: 'hgvsc', getVal: variant => variant.mainTranscript.hgvsc },
  { header: 'hgvsp', getVal: variant => variant.mainTranscript.hgvsp },
]

export const VARIANT_GENOTYPE_EXPORT_DATA = [
  { header: 'sample_id', getVal: (genotype, individualId) => individualId },
  { header: 'genotype', getVal: genotype => (genotype.alleles.length ? genotype.alleles.join('/') : './.') },
  { header: 'filter' },
  { header: 'ad' },
  { header: 'dp' },
  { header: 'gq' },
  { header: 'ab' },
]
