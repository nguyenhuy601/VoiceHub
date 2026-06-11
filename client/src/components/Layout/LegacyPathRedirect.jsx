import { Navigate, useParams } from 'react-router-dom';

/** Redirect legacy path có :orgId sang suite collaborate. */
const LegacyPathRedirect = ({ toTemplate }) => {
  const params = useParams();
  const to = Object.entries(params).reduce(
    (path, [key, value]) => path.replace(`:${key}`, encodeURIComponent(value || '')),
    toTemplate
  );
  return <Navigate to={to} replace />;
};

export default LegacyPathRedirect;
