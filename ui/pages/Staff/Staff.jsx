import React from 'react'
import PropTypes from 'prop-types'
import { connect } from 'react-redux'
import { NavLink, Route, Switch } from 'react-router-dom'
import { Header, Menu } from 'semantic-ui-react'

import { getUser } from 'redux/selectors'
import { HorizontalSpacer, VerticalSpacer } from 'shared/components/Spacers'
import { snakecaseToTitlecase } from 'shared/utils/stringUtils'

import Anvil from './components/Anvil'
import DiscoverySheet from './components/DiscoverySheet'
import ElasticsearchStatus from './components/ElasticsearchStatus'
import CreateUser from './components/CreateUser'

const STAFF_PAGES = [
  { path: 'anvil', params: '/:projectGuid?', component: Anvil },
  { path: 'discovery_sheet', params: '/:projectGuid?', component: DiscoverySheet },
  { path: 'elasticsearch_status', component: ElasticsearchStatus },
  { path: 'komp_export' },
  { path: 'seqr_stats' },
  { path: 'create_user', component: CreateUser },
]

// TODO shared 404 component
const Error404 = () => (<Header size="huge" textAlign="center">Error 404: Page Not Found</Header>)
const Error401 = () => (<Header size="huge" textAlign="center">Error 401: Unauthorized</Header>)

export const StaffPageHeader = () =>
  <Menu attached>
    <Menu.Item><Header size="medium"><HorizontalSpacer width={90} /> Staff Pages:</Header></Menu.Item>
    {STAFF_PAGES.map(({ path, component }) => {
      const href = `/staff/${path}`
      const linkProps = component ? { as: NavLink, to: href } : { as: 'a', href }
      return <Menu.Item key={path} {...linkProps}>{snakecaseToTitlecase(path)}</Menu.Item>
    })}
  </Menu>

const Staff = ({ match, user }) => (
  user.isStaff ? (
    <div>
      <VerticalSpacer height={20} />
      <Switch>
        {STAFF_PAGES.filter(({ component }) => component).map(({ path, params, component }) =>
          <Route key={path} path={`${match.url}/${path}${params || ''}`} component={component} />,
        )}
        <Route path={match.url} component={null} />
        <Route component={() => <Error404 />} />
      </Switch>
    </div>
  ) : <Error401 />
)

Staff.propTypes = {
  user: PropTypes.object,
  match: PropTypes.object,
}

const mapStateToProps = state => ({
  user: getUser(state),
})

export default connect(mapStateToProps)(Staff)
