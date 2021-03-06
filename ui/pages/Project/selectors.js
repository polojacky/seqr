import orderBy from 'lodash/orderBy'
import { createSelector } from 'reselect'

import { getSearchResults } from 'redux/utils/reduxSearchEnhancer'
import {
  FAMILY_ANALYSIS_STATUS_OPTIONS,
  NOTE_TAG_NAME,
  EXCLUDED_TAG_NAME,
  REVIEW_TAG_NAME,
  KNOWN_GENE_FOR_PHENOTYPE_TAG_NAME,
  DISCOVERY_CATEGORY_NAME,
  SORT_BY_FAMILY_GUID,
  VARIANT_SORT_LOOKUP,
  FAMILY_FIELD_ID,
  INDIVIDUAL_FIELD_ID,
  FAMILY_FIELD_FIRST_SAMPLE,
  getVariantsExportData,
  latestSamplesLoaded,
  familySamplesLoaded,
} from 'shared/utils/constants'
import { toCamelcase, toSnakecase } from 'shared/utils/stringUtils'

import {
  getProjectsByGuid, getFamiliesGroupedByProjectGuid, getIndividualsByGuid, getSamplesByGuid, getGenesById, getUser,
  getAnalysisGroupsGroupedByProjectGuid, getSavedVariantsByGuid, getFirstSampleByFamily, getSortedIndividualsByFamily,
} from 'redux/selectors'

import {
  SHOW_ALL,
  SORT_BY_FAMILY_NAME,
  CASE_REVIEW_STATUS_OPTIONS,
  FAMILY_FILTER_LOOKUP,
  FAMILY_SORT_OPTIONS,
  FAMILY_EXPORT_DATA,
  INTERNAL_FAMILY_EXPORT_DATA,
  INDIVIDUAL_HAS_DATA_FIELD,
  INDIVIDUAL_EXPORT_DATA,
  INTERNAL_INDIVIDUAL_EXPORT_DATA,
  SAMPLE_EXPORT_DATA,
} from './constants'

const FAMILY_SORT_LOOKUP = FAMILY_SORT_OPTIONS.reduce(
  (acc, opt) => ({
    ...acc,
    [opt.value]: opt.createSortKeyGetter,
  }), {},
)

// project data selectors

export const getProjectDetailsIsLoading = state => state.projectDetailsLoading.isLoading
export const getProjectSavedVariantsIsLoading = state => state.projectSavedVariantsLoading.isLoading
export const getProjectGuid = state => state.currentProjectGuid

export const getProject = createSelector(
  getProjectsByGuid, getProjectGuid, (projectsByGuid, currentProjectGuid) => projectsByGuid[currentProjectGuid],
)

const selectEntitiesForProjectGuid = (entitiesGroupedByProjectGuid, projectGuid) => entitiesGroupedByProjectGuid[projectGuid] || {}
export const getProjectFamiliesByGuid = createSelector(getFamiliesGroupedByProjectGuid, getProjectGuid, selectEntitiesForProjectGuid)
export const getProjectAnalysisGroupsByGuid = createSelector(getAnalysisGroupsGroupedByProjectGuid, getProjectGuid, selectEntitiesForProjectGuid)

export const getProjectAnalysisGroupFamiliesByGuid = createSelector(
  getProjectFamiliesByGuid,
  getProjectAnalysisGroupsByGuid,
  (state, props) => (props.match ? props.match.params.analysisGroupGuid : props.analysisGroupGuid),
  (projectFamiliesByGuid, projectAnalysisGroupsByGuid, analysisGroupGuid) => {
    if (!analysisGroupGuid || !projectAnalysisGroupsByGuid[analysisGroupGuid]) {
      return projectFamiliesByGuid
    }
    return projectAnalysisGroupsByGuid[analysisGroupGuid].familyGuids.reduce(
      (acc, familyGuid) => ({ ...acc, [familyGuid]: projectFamiliesByGuid[familyGuid] }), {},
    )
  },
)

export const getProjectAnalysisGroupIndividualsByGuid = createSelector(
  getIndividualsByGuid,
  getProjectAnalysisGroupFamiliesByGuid,
  (individualsByGuid, familiesByGuid) =>
    Object.values(familiesByGuid).reduce((acc, family) => ({
      ...acc,
      ...family.individualGuids.reduce((indivAcc, individualGuid) => (
        { ...indivAcc, [individualGuid]: { ...individualsByGuid[individualGuid], [FAMILY_FIELD_ID]: family.familyId } }
      ), {}),
    }), {}),
)

export const getProjectAnalysisGroupSamplesByGuid = createSelector(
  getSamplesByGuid,
  getProjectAnalysisGroupIndividualsByGuid,
  (samplesByGuid, individualsByGuid) =>
    Object.values(individualsByGuid).reduce((acc, individual) => ({
      ...acc,
      ...individual.sampleGuids.reduce((sampleAcc, sampleGuid) => (
        { ...sampleAcc, [sampleGuid]: samplesByGuid[sampleGuid] }
      ), {}),
    }), {}),
)


// Saved variant selectors
export const getSavedVariantTableState = state => state.savedVariantTableState
export const getSavedVariantCategoryFilter = state => state.savedVariantTableState.categoryFilter || SHOW_ALL
export const getSavedVariantSortOrder = state => state.savedVariantTableState.sort || SORT_BY_FAMILY_GUID
export const getSavedVariantHideExcluded = state => state.savedVariantTableState.hideExcluded
export const getSavedVariantHideReviewOnly = state => state.savedVariantTableState.hideReviewOnly
const getSavedVariantHideKnownGeneForPhenotype = state => state.savedVariantTableState.hideKnownGeneForPhenotype
export const getSavedVariantCurrentPage = state => state.savedVariantTableState.page || 1
export const getSavedVariantRecordsPerPage = state => state.savedVariantTableState.recordsPerPage || 25

export const getProjectSavedVariants = createSelector(
  getSavedVariantsByGuid,
  (state, props) => props.match.params,
  getProjectFamiliesByGuid,
  getProjectAnalysisGroupsByGuid,
  (savedVariants, { tag, familyGuid, analysisGroupGuid, variantGuid }, projectFamiliesByGuid, projectAnalysisGroupsByGuid) => {
    let variants = Object.values(savedVariants)
    if (variantGuid) {
      return variants.filter(o => o.variantGuid === variantGuid)
    }

    if (analysisGroupGuid && projectAnalysisGroupsByGuid[analysisGroupGuid]) {
      const analysisGroupFamilyGuids = projectAnalysisGroupsByGuid[analysisGroupGuid].familyGuids
      variants = variants.filter(o => o.familyGuids.some(fg => analysisGroupFamilyGuids.includes(fg)))
    }
    else if (familyGuid) {
      variants = variants.filter(o => o.familyGuids.includes(familyGuid))
    } else {
      variants = variants.filter(o => o.familyGuids.some(fg => Object.keys(projectFamiliesByGuid).includes(fg)))
    }

    if (tag) {
      if (tag === NOTE_TAG_NAME) {
        variants = variants.filter(o => o.notes.length)
      } else {
        variants = variants.filter(o => o.tags.some(t => t.name === tag))
      }
    }

    return variants
  },
)

export const getSavedVariantVisibleIndices = createSelector(
  getSavedVariantCurrentPage, getSavedVariantRecordsPerPage,
  (page, recordsPerPage) => {
    return [(page - 1) * recordsPerPage, page * recordsPerPage]
  },
)

export const getFilteredProjectSavedVariants = createSelector(
  getProjectSavedVariants,
  getSavedVariantCategoryFilter,
  getSavedVariantHideExcluded,
  getSavedVariantHideReviewOnly,
  getSavedVariantHideKnownGeneForPhenotype,
  (state, props) => props.match.params.tag,
  (projectSavedVariants, categoryFilter, hideExcluded, hideReviewOnly, hideKnownGeneForPhenotype, tag) => {
    let variantsToShow = projectSavedVariants
    if (hideExcluded) {
      variantsToShow = variantsToShow.filter(variant => variant.tags.every(t => t.name !== EXCLUDED_TAG_NAME))
    }
    if (hideReviewOnly) {
      variantsToShow = variantsToShow.filter(variant => variant.tags.length !== 1 || variant.tags[0].name !== REVIEW_TAG_NAME)
    }
    if (!tag) {
      if (hideKnownGeneForPhenotype && categoryFilter === DISCOVERY_CATEGORY_NAME) {
        variantsToShow = variantsToShow.filter(variant => variant.tags.every(t => t.name !== KNOWN_GENE_FOR_PHENOTYPE_TAG_NAME))
      }

      if (categoryFilter !== SHOW_ALL) {
        variantsToShow = variantsToShow.filter(variant => variant.tags.some(t => t.category === categoryFilter))
      }
    }
    return variantsToShow
  },
)

export const getVisibleSortedProjectSavedVariants = createSelector(
  getFilteredProjectSavedVariants,
  getSavedVariantSortOrder,
  getSavedVariantVisibleIndices,
  getGenesById,
  getUser,
  (filteredSavedVariants, sort, visibleIndices, genesById, user) => {
    // Always secondary sort on xpos
    filteredSavedVariants.sort((a, b) => {
      return VARIANT_SORT_LOOKUP[sort](a, b, genesById, user) || a.xpos - b.xpos
    })
    return filteredSavedVariants.slice(...visibleIndices)
  },
)

export const getSavedVariantTotalPages = createSelector(
  getFilteredProjectSavedVariants, getSavedVariantRecordsPerPage,
  (filteredSavedVariants, recordsPerPage) => {
    return Math.max(1, Math.ceil(filteredSavedVariants.length / recordsPerPage))
  },
)

export const getSavedVariantExportConfig = createSelector(
  getFilteredProjectSavedVariants,
  getVariantsExportData,
)

// Family table selectors
export const getFamiliesTableState = createSelector(
  (state, ownProps) => state[`${toCamelcase((ownProps || {}).tableName) || 'family'}TableState`],
  tableState => tableState,
)
export const getFamiliesFilter = createSelector(
  getFamiliesTableState,
  familyTableState => familyTableState.familiesFilter || SHOW_ALL,
)
export const getFamiliesSortOrder = createSelector(
  getFamiliesTableState,
  familyTableState => familyTableState.familiesSortOrder || SORT_BY_FAMILY_NAME,
)
export const getFamiliesSortDirection = createSelector(
  getFamiliesTableState,
  familyTableState => familyTableState.familiesSortDirection || 1,
)

/**
 * function that returns an array of family guids that pass the currently-selected
 * familiesFilter.
 *
 * @param state {object} global Redux state
 */
export const getVisibleFamilies = createSelector(
  getProjectAnalysisGroupFamiliesByGuid,
  getIndividualsByGuid,
  getSamplesByGuid,
  getUser,
  getFamiliesFilter,
  getSearchResults('familiesByGuid'),
  (familiesByGuid, individualsByGuid, samplesByGuid, user, familiesFilter, familySearchResults) => {
    const searchedFamilies = familySearchResults.map(family => familiesByGuid[family]).filter(family => family)

    if (!familiesFilter || !FAMILY_FILTER_LOOKUP[familiesFilter]) {
      return searchedFamilies
    }

    const familyFilter = FAMILY_FILTER_LOOKUP[familiesFilter].createFilter(individualsByGuid, samplesByGuid, user)
    return searchedFamilies.filter(familyFilter)
  },
)


/**
 * function that returns an array of currently-visible family objects, sorted according to
 * currently-selected values of familiesSortOrder and familiesSortDirection.
 *
 * @param state {object} global Redux state
 */
export const getVisibleFamiliesInSortedOrder = createSelector(
  getVisibleFamilies,
  getIndividualsByGuid,
  getSamplesByGuid,
  getFamiliesSortOrder,
  getFamiliesSortDirection,
  (visibleFamilies, individualsByGuid, samplesByGuid, familiesSortOrder, familiesSortDirection) => {
    if (!familiesSortOrder || !FAMILY_SORT_LOOKUP[familiesSortOrder]) {
      return visibleFamilies
    }

    const getSortKey = FAMILY_SORT_LOOKUP[familiesSortOrder](individualsByGuid, samplesByGuid)

    return orderBy(visibleFamilies, [getSortKey], [familiesSortDirection > 0 ? 'asc' : 'desc'])
  },
)

export const getEntityExportConfig = (project, rawData, tableName, fileName, fields) => ({
  filename: `${project.name.replace(' ', '_').toLowerCase()}_${tableName ? `${toSnakecase(tableName)}_` : ''}${fileName}`,
  rawData,
  headers: fields.map(config => config.header),
  processRow: family => fields.map((config) => {
    const val = family[config.field]
    return config.format ? config.format(val) : val
  }),
})

export const getFamiliesExportData = createSelector(
  getVisibleFamiliesInSortedOrder,
  getFirstSampleByFamily,
  (visibleFamilies, firstSampleByFamily) =>
    visibleFamilies.reduce((acc, family) =>
      [...acc, { ...family, [FAMILY_FIELD_FIRST_SAMPLE]: firstSampleByFamily[family.familyGuid] }], []),
)

export const getFamiliesExportConfig = createSelector(
  getProject,
  getFamiliesExportData,
  (state, ownProps) => (ownProps || {}).tableName,
  () => 'families',
  (state, ownProps) => ((ownProps || {}).internal ? FAMILY_EXPORT_DATA.concat(INTERNAL_FAMILY_EXPORT_DATA) : FAMILY_EXPORT_DATA),
  getEntityExportConfig,
)

export const getIndividualsExportData = createSelector(
  getVisibleFamiliesInSortedOrder,
  getSortedIndividualsByFamily,
  getSamplesByGuid,
  (families, individualsByFamily, samplesByGuid) => families.reduce((acc, family) =>
    [...acc, ...individualsByFamily[family.familyGuid].map(individual => ({
      ...individual,
      [FAMILY_FIELD_ID]: family.familyId,
      [INDIVIDUAL_HAS_DATA_FIELD]: latestSamplesLoaded(individual.sampleGuids, samplesByGuid).length > 0,
    }))], [],
  ),
)

export const getIndividualsExportConfig = createSelector(
  getProject,
  getIndividualsExportData,
  (state, ownProps) => (ownProps || {}).tableName,
  () => 'individuals',
  (state, ownProps) => ((ownProps || {}).internal ? INDIVIDUAL_EXPORT_DATA.concat(INTERNAL_INDIVIDUAL_EXPORT_DATA) : INDIVIDUAL_EXPORT_DATA),
  getEntityExportConfig,
)

const getSamplesExportData = createSelector(
  getVisibleFamiliesInSortedOrder,
  getIndividualsByGuid,
  getSamplesByGuid,
  (visibleFamilies, individualsByGuid, samplesByGuid) =>
    visibleFamilies.reduce((acc, family) =>
      [...acc, ...familySamplesLoaded(family, individualsByGuid, samplesByGuid).map(sample => ({
        ...sample,
        [FAMILY_FIELD_ID]: family.familyId,
        [INDIVIDUAL_FIELD_ID]: individualsByGuid[sample.individualGuid].individualId,
      }))], []),
)

export const getSamplesExportConfig = createSelector(
  getProject,
  getSamplesExportData,
  (state, ownProps) => (ownProps || {}).tableName,
  () => 'samples',
  () => SAMPLE_EXPORT_DATA,
  getEntityExportConfig,
)

export const getCaseReviewStatusCounts = createSelector(
  getProjectGuid,
  getIndividualsByGuid,
  (projectGuid, individualsByGuid) => {
    const caseReviewStatusCounts = Object.values(individualsByGuid).reduce((acc, individual) => (
      individual.projectGuid === projectGuid ?
        { ...acc, [individual.caseReviewStatus]: (acc[individual.caseReviewStatus] || 0) + 1 } : acc
    ), {})

    return CASE_REVIEW_STATUS_OPTIONS.map(option => (
      { ...option, count: (caseReviewStatusCounts[option.value] || 0) }),
    )
  })

export const getAnalysisStatusCounts = createSelector(
  getProjectAnalysisGroupFamiliesByGuid,
  (familiesByGuid) => {
    const analysisStatusCounts = Object.values(familiesByGuid).reduce((acc, family) => ({
      ...acc, [family.analysisStatus]: (acc[family.analysisStatus] || 0) + 1,
    }), {})

    return FAMILY_ANALYSIS_STATUS_OPTIONS.map(option => (
      { ...option, count: (analysisStatusCounts[option.value] || 0) }),
    )
  })


// user options selectors

export const getUsersByUsername = state => state.usersByUsername
export const getUserOptionsIsLoading = state => state.userOptionsLoading.isLoading

export const getUserOptions = createSelector(
  getUsersByUsername,
  usersByUsername => Object.values(usersByUsername).map(
    user => ({ key: user.username, value: user.username, text: user.email }),
  ),
)
