import NavigationSidebar from './NavigationSidebar';

const ProfileSidebar = ({ landingDemo = false } = {}) => (
  <NavigationSidebar suite="me" landingDemo={landingDemo} />
);

export default ProfileSidebar;
