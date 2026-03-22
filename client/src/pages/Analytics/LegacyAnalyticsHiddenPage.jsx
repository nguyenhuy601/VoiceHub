import NavigationSidebar from '../../components/Layout/NavigationSidebar';

// Legacy analytics UI extracted from NotFoundPage.
// This page is intentionally hidden (no route in App).
function LegacyAnalyticsHiddenPage() {
  return (
    <div className="min-h-screen flex">
      <NavigationSidebar />
      <div className="flex-1 p-6">
        <h1 className="text-3xl font-bold text-white mb-2">Legacy Analytics (Hidden)</h1>
        <p className="text-gray-400">
          Trang nay da duoc tach rieng khoi NotFoundPage va dang an (khong duoc route).
        </p>
      </div>
    </div>
  );
}

export default LegacyAnalyticsHiddenPage;
