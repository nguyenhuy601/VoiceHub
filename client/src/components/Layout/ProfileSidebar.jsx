import FigmaNavigationSidebar from './FigmaNavigationSidebar';

const ProfileSidebar = ({ landingDemo = false } = {}) => (
  <FigmaNavigationSidebar suite="me" landingDemo={landingDemo} />
);

export default ProfileSidebar;
