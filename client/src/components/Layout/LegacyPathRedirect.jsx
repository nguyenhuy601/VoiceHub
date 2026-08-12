import { Navigate, useLocation, useParams } from 'react-router-dom';

/** Redirect legacy path có :orgId sang suite collaborate — giữ query (?join=1, …). */
const LegacyPathRedirect = ({ toTemplate }) => {
  const params = useParams();
  const location = useLocation();
  const to = Object.entries(params).reduce(
    (path, [key, value]) => path.replace(`:${key}`, encodeURIComponent(value || '')),
    toTemplate
  );
  return <Navigate to={{ pathname: to, search: location.search }} replace />;
};

export default LegacyPathRedirect;
