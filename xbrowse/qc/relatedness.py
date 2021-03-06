"""
This file contains all of the load time QC methods
Some of them are pre-loading variants, some post...the idea is that everything
that needs to be run at load time goes here. Some stuff may also be used at runtime,
but nothing in here depends on runtime_qc

"""

from xbrowse import genomeloc

# def indivs_missing_from_vcf(family, vcf_file):
#     """
#     Return list of indiv_ids in family that are not in vcf_file
#     Empty list if all individuals are in vcf
#     """
#     in_vcf = set(vcf_stuff.get_ids_from_vcf(vcf_file))
#     not_in_vcf = []
#     for indiv_id in family['individuals'].keys():
#         if not indiv_id in in_vcf:
#             not_in_vcf.append(indiv_id)
#
#     return not_in_vcf

def dst_between_two_indivs(datastore, project_id, indiv1, indiv2):
    """
    Calculate DST between indiv1 and indiv2
    """

    array1 = datastore.get_snp_array(project_id, indiv1['family_id'], indiv1['indiv_id'])
    array2 = datastore.get_snp_array(project_id, indiv2['family_id'], indiv2['indiv_id'])

    num_snps = 0
    total_distance = 0
    for i in range(len(array1)):
        if array1[i] == -1 or array2[i] == -1:
            continue
        num_snps += 1
        total_distance += abs(array1[i]-array2[i])

    return float(total_distance) / num_snps / 2

def pi_hat_between_two_indivs(array1, array2):
    """
    Returns PI_HAT from PLINK
    array1 and array2 are SNP arrays
    """
    raise

def get_panel(filename):
    """
    Returns a list of SNP objects. Each object has pos (full position), ref, alt
    """
    lines = open(filename).readlines()

    ret = []
    for line in lines:

        if line.startswith('#'): continue

        fields = line.strip().split()
        snp = {
            'pos': genomeloc.get_single_location_from_string(fields[0]),
            'ref': fields[1],
            'alt': fields[2],
        }
        ret.append(snp)
    return ret

def get_panel_positions(filename):
    """
    Array of full positions, rather than snp objects
    """
    return [snp['pos'] for snp in get_panel(filename)]

#def family_relatedness_matrix(datastore, family):
#    """
#    Returns all
#    stats are calculated by calling --genome in PLINK
#    Result is a list of dicts, each with keys indiv1, indiv2,
#    and then multiple metrics of relatedness stats, most notably PI_HAT
#    """
#
#    # TODO: review testing for this!
#
#    panel = get_panel(local_settings.COMMON_SNP_FILE)
#    genotypes = [ (i, datastore.get_snp_array(family['project_id'], family['family_id'], i['indiv_id']) ) for i in family['individuals'].values() ]
#    return calculate_relatedness_matrix(panel, genotypes)

#def calculate_relatedness_matrix(panel, genotypes):
#    """
#    Calculates the actual relatednes matrix; less dependency - does not depend on database
#    """
#    directory = tempfile.mkdtemp()
#
#    write_plink_fileset(directory, panel, genotypes)
#
#    start_directory = os.getcwd()
#    os.chdir(directory)
#
#    plink_args = ['--genome', '--file', 'autogenerated_xbrowse', '--no-fid', '--no-parents', '--no-sex', '--no-pheno', '--noweb']
#    plink_command = sh.Command(local_settings.PLINK_BIN)
#    plink_command(plink_args)
#    genome_lines = open('plink.genome').read().splitlines()
#
#    os.chdir(start_directory)
#    # TODO: remove temp files
#
#    results = []
#    for line in genome_lines:
#        fields = line.split()
#        r = {
#            'indiv1': fields[0],
#            'indiv2': fields[2],
#            }
#
#        for key, i in [('PI_HAT', 9), ('DST', 11), ('Z0', 6), ('Z1', 7), ('Z2', 8)]:
#            try: r[key] = float(fields[i])
#            except: r[key] = None
#
#        results.append(r)
#
#    return results

def write_plink_fileset(directory, snp_panel, genotypes):
    """
    Writes a .ped and .map file in directory
    Files named autogenerated_xbrowse.*, and will overwrite files that exist...
    so choose temp directories wisely

    snp_panel is a panel from get_panel; genotypes is a list of (individual, snp_array) tuples
    """
    # TODO: I forget how to concat filenames
    ped_file = directory + '/autogenerated_xbrowse.ped'
    write_ped(ped_file, snp_panel, genotypes)

    map_file = directory + '/autogenerated_xbrowse.map'
    write_map(map_file, snp_panel)

def write_ped(filename, snp_panel, genotypes):
    """
    Writes a PED file; same params as write_plink_fileset
    Right now this is a "simple" ped file as described at http://pngu.mgh.harvard.edu/~purcell/plink/data.shtml#plink
    Basically just indiv_id and then a list of genotypes, but I may be changing this soon,
    so still requiring a full indiv object
    """

    num_indivs = len(genotypes)
    num_snps = len(snp_panel)

    f = open(filename, 'w')
    for indiv, snp_array in genotypes:

        # check that each genotype array has the same # snps
        # this method does not do comprehensive error checking and there are many ways
        # to cause trouble with bad input, but randomly adding this check here
        if len(snp_array) != num_snps:
            raise "Invalid SNP array for %s" % indiv['indiv_id']

        fields = [indiv['indiv_id'],]

        for i in range(num_snps):

            if snp_array[i] == -1:
                fields.extend(['0', '0'])
                continue

            ref, alt = snp_panel[i]['ref'], snp_panel[i]['alt']

            # allele 1
            if snp_array[i] > 0:
                fields.append(alt)
            else:
                fields.append(ref)

            # allele 2
            if snp_array[i] == 2:
                fields.append(alt)
            else:
                fields.append(ref)

        f.write('\t'.join(fields) + '\n')

    f.close()

def write_map(filename, snp_panel):
    """
    Writes a MAP file to filename, with the SNPs in snp_panel
    Note that current implementation does not consider genetic distance, may want to fix that.
    """
    f = open(filename, 'w')
    for snp in snp_panel:
        chr, pos = genomeloc.get_chr_pos(snp['pos'])
        fields = [chr[3:], str(snp['pos']), '0', str(pos)]
        f.write('\t'.join(fields) + '\n')
    f.close()

def get_relatedness_within_family(family, indiv1, indiv2):
    """
    Relatedness object for two family members, order independent
    indiv1 and indiv2 are indiv_ids
    """
    for item in family['relatedness_matrix']:
        if item['indiv1'] == indiv1 and item['indiv2'] == indiv2: return item
        if item['indiv2'] == indiv1 and item['indiv1'] == indiv2: return item
    return None

def num_missing_in_snp_array(datastore, project_id, family_id, indiv_id):
    """
    Returns number of missing genotypes from COMMON_SNP_FILE for given individual
    -1 if any error
    """
    snp_array = datastore.get_snp_array(project_id, family_id, indiv_id)
    if not snp_array:
        return -1

    return len([i for i in snp_array if i < 0])
