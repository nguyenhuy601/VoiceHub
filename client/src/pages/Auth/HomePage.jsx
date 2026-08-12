import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Moon, Sun } from 'lucide-react';
import { GradientButton, Modal } from '../../components/Shared';
import BrandPageLoader from '../../components/Shared/BrandPageLoader';
import { useAuth } from '../../context/AuthContext';
import { useLocale } from '../../context/LocaleContext';
import { useTheme } from '../../context/ThemeContext';
import { HOME_LOCALES } from '../../locales/homePage';
import { HOME_LANDING } from '../../locales/homePageLanding';

const TECH_STACK = ['React', 'Node.js', 'Socket.io', 'WebRTC', 'MongoDB', 'Redis', 'Docker', 'JWT'];

function scrollToId(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function shell(isDark, extra = '') {
  return `${isDark ? 'border border-white/10 bg-slate-900/70 shadow-[0_0_0_1px_rgba(255,255,255,0.04)]' : 'border border-slate-200/90 bg-white shadow-sm'} backdrop-blur-sm ${extra}`;
}

/** Mockup nổi hero: chat + analytics + task + cuộc gọi — animation float nhẹ. */
function FloatingHeroMockup({ isDarkMode, labels }) {
  const [tChat, tMeet, tTask] = labels.tiles;
  return (
    <div
      className={`relative mx-auto w-full max-w-xl motion-safe:animate-float motion-reduce:animate-none lg:max-w-none ${
        isDarkMode ? 'drop-shadow-[0_24px_48px_rgba(6,182,212,0.18)]' : 'drop-shadow-[0_20px_40px_rgba(15,23,42,0.12)]'
      }`}
    >
      <div
        className={`relative overflow-hidden rounded-2xl border p-3 sm:rounded-3xl sm:p-4 ${
          isDarkMode
            ? 'border-cyan-500/25 bg-gradient-to-br from-slate-950 via-[#0c1526] to-slate-900'
            : 'border-cyan-200/60 bg-gradient-to-br from-white via-slate-50 to-cyan-50/90'
        }`}
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_20%_0%,rgba(34,211,238,0.12),transparent_50%),radial-gradient(ellipse_at_100%_100%,rgba(20,184,166,0.1),transparent_45%)]" />
        <div className="relative flex gap-2 sm:gap-3">
          <div className={`hidden w-[22%] shrink-0 rounded-xl p-2 sm:block ${shell(isDarkMode, 'min-h-[200px]')}`}>
            <div className={`mb-2 h-2 w-10 rounded ${isDarkMode ? 'bg-cyan-500/50' : 'bg-cyan-600/40'}`} />
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className={`mb-1.5 h-1.5 rounded ${isDarkMode ? 'bg-white/10' : 'bg-slate-300/80'}`} style={{ width: `${55 + i * 6}%` }} />
            ))}
          </div>
          <div className="min-w-0 flex-1 space-y-2 sm:space-y-3">
            <div className={`flex flex-wrap items-center gap-2 rounded-xl p-2 sm:p-3 ${shell(isDarkMode)}`}>
              <div className="h-8 w-8 shrink-0 rounded-lg bg-gradient-to-br from-cyan-500 to-teal-600 shadow-md" />
              <div className="min-w-0 flex-1 space-y-1">
                <div className={`h-2 max-w-[10rem] rounded ${isDarkMode ? 'bg-white/20' : 'bg-slate-300'}`} />
                <div className={`h-1.5 rounded ${isDarkMode ? 'bg-white/10' : 'bg-slate-200'}`} style={{ width: '75%' }} />
              </div>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${isDarkMode ? 'bg-emerald-500/20 text-emerald-300' : 'bg-emerald-100 text-emerald-800'}`}>
                {labels.live}
              </span>
            </div>
            <div className={`grid grid-cols-3 gap-2 rounded-xl p-2 sm:gap-3 sm:p-3 ${shell(isDarkMode)}`}>
              {[tChat, tMeet, tTask].map((label, i) => (
                <div key={label} className={`rounded-lg px-2 py-3 text-center ${isDarkMode ? 'bg-white/5' : 'bg-slate-100/90'}`}>
                  <div className={`mx-auto mb-1 h-6 w-6 rounded-md ${i === 0 ? 'bg-green-500/30' : i === 1 ? 'bg-orange-500/30' : 'bg-indigo-500/30'}`} />
                  <span className={`text-[10px] font-medium sm:text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>{label}</span>
                </div>
              ))}
            </div>
            <div className={`rounded-xl p-2 sm:p-3 ${shell(isDarkMode)}`}>
              <div className="mb-2 flex items-center justify-between">
                <span className={`text-[10px] font-semibold uppercase tracking-wide ${isDarkMode ? 'text-slate-500' : 'text-slate-500'}`}>{labels.messages}</span>
                <span className={`text-[10px] ${isDarkMode ? 'text-cyan-400' : 'text-cyan-700'}`}>●●●</span>
              </div>
              {[1, 2, 3].map((row) => (
                <div key={row} className={`mb-2 flex gap-2 rounded-lg p-2 last:mb-0 ${isDarkMode ? 'bg-white/[0.04]' : 'bg-slate-50'}`}>
                  <div className={`h-7 w-7 shrink-0 rounded-full ${isDarkMode ? 'bg-cyan-500/25' : 'bg-cyan-200'}`} />
                  <div className="flex-1 space-y-1 pt-0.5">
                    <div className={`h-1.5 w-1/3 rounded ${isDarkMode ? 'bg-white/15' : 'bg-slate-300'}`} />
                    <div className={`h-1.5 rounded ${isDarkMode ? 'bg-white/8' : 'bg-slate-200'}`} style={{ width: `${70 + row * 8}%` }} />
                  </div>
                </div>
              ))}
            </div>
            <div className={`flex items-center justify-between gap-2 rounded-xl px-3 py-2 ${shell(isDarkMode, 'bg-gradient-to-r from-cyan-950/40 to-teal-950/30')}`}>
              <span className={`text-[11px] font-medium ${isDarkMode ? 'text-cyan-200' : 'text-cyan-900'}`}>{labels.callLine}</span>
              <span className={`rounded-lg px-2 py-1 text-[10px] font-bold ${isDarkMode ? 'bg-cyan-500 text-slate-950' : 'bg-cyan-600 text-white'}`}>{labels.join}</span>
            </div>
          </div>
          <div className={`hidden w-[24%] shrink-0 flex-col gap-2 rounded-xl p-2 lg:flex ${shell(isDarkMode)}`}>
            <p className={`text-[10px] font-semibold uppercase tracking-wide ${isDarkMode ? 'text-slate-500' : 'text-slate-500'}`}>{labels.activity}</p>
            <div className={`h-16 rounded-lg ${isDarkMode ? 'bg-gradient-to-t from-cyan-900/40 to-transparent' : 'bg-cyan-100/50'}`} />
            <div className={`mt-auto space-y-1 rounded-lg p-2 ${isDarkMode ? 'bg-white/5' : 'bg-slate-100'}`}>
              <div className={`h-1.5 rounded ${isDarkMode ? 'bg-white/15' : 'bg-slate-300'}`} />
              <div className={`h-1.5 w-2/3 rounded ${isDarkMode ? 'bg-white/10' : 'bg-slate-200'}`} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function HomePage() {
  const [selectedFeatureId, setSelectedFeatureId] = useState(null);
  const { locale, toggleLocale } = useLocale();
  const copy = HOME_LOCALES[locale];
  const [storyFocusId, setStoryFocusId] = useState(() => HOME_LOCALES.vi.storySteps[0].featureId);
  const { isAuthenticated, loading } = useAuth();
  const { isDarkMode, toggleTheme } = useTheme();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && isAuthenticated) {
      navigate('/app', { replace: true });
    }
  }, [loading, isAuthenticated, navigate]);

  useEffect(() => {
    setStoryFocusId(copy.storySteps[0].featureId);
  }, [locale]);

  if (!loading && isAuthenticated) {
    return <BrandPageLoader />;
  }

  const selectedFeature = useMemo(
    () => copy.features.find((f) => f.id === selectedFeatureId) ?? null,
    [copy.features, selectedFeatureId],
  );

  const closeModal = useCallback(() => setSelectedFeatureId(null), []);

  const pageMax = 'mx-auto w-full max-w-[1440px] px-5 sm:px-10 lg:px-16 xl:px-20';

  return (
    <div
      className={`relative min-h-screen overflow-hidden ${
        isDarkMode
          ? 'bg-[#020817] text-slate-100'
          : 'bg-gradient-to-b from-sky-300/95 via-sky-100 to-indigo-100 text-slate-900'
      }`}
    >
      <ShellWaveBackdrop />

      <header
        className={`sticky top-0 z-30 border-b backdrop-blur-xl ${
          isDarkMode
            ? 'border-slate-800/80 bg-[#020817]/85'
            : 'border-sky-300/70 bg-sky-100/90'
        }`}
      >
        <div className={`${pageMax} flex items-center justify-between py-3.5`}>
          <Link to="/" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-teal-600 text-sm font-bold text-white shadow-lg shadow-cyan-900/30">
              V
            </div>
            <div>
              <p className={`text-base font-bold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>VoiceHub</p>
              <p className={`text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-700'}`}>{copy.nav.tagline}</p>
            </div>
          </Link>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={toggleTheme}
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition ${
                isDarkMode
                  ? 'border-slate-600 text-slate-200 hover:bg-white/10 hover:border-slate-500'
                  : 'border-slate-300 text-slate-700 hover:bg-slate-100 hover:border-slate-400'
              }`}
              aria-label={isDarkMode ? copy.a11y.themeUseLight : copy.a11y.themeUseDark}
            >
              {isDarkMode ? <Sun className="h-[1.125rem] w-[1.125rem]" strokeWidth={2} /> : <Moon className="h-[1.125rem] w-[1.125rem]" strokeWidth={2} />}
            </button>
            <button
              type="button"
              onClick={toggleLocale}
              title={locale === 'vi' ? copy.langTooltip.toEn : copy.langTooltip.toVi}
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border text-lg leading-none transition ${
                isDarkMode
                  ? 'border-slate-600 hover:bg-white/10 hover:border-cyan-500/40'
                  : 'border-slate-300 hover:bg-slate-100 hover:border-cyan-400/60'
              }`}
              aria-label={copy.a11y.languageSwitch}
            >
              <span aria-hidden>{locale === 'vi' ? '🇻🇳' : '🇺🇸'}</span>
            </button>
            {isAuthenticated ? (
              <button
                type="button"
                onClick={() => navigate('/app')}
                className="rounded-2xl bg-gradient-to-r from-cyan-600 to-teal-600 px-4 py-2 text-sm font-bold text-white shadow-md transition hover:from-cyan-500 hover:to-teal-500 sm:px-5 sm:py-2.5"
              >
                {copy.nav.enterApp}
              </button>
            ) : (
              <>
                <Link
                  to="/login"
                  className={`rounded-xl border px-3 py-2 text-sm font-semibold transition sm:px-4 ${
                    isDarkMode ? 'border-slate-600 text-slate-100 hover:bg-white/5' : 'border-slate-300 text-slate-800 hover:bg-slate-50'
                  }`}
                >
                  {copy.nav.login}
                </Link>
                <Link to="/register" className={FIGMA_HOME_NAV_CTA}>
                  {landing.nav.registerCta}
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <section className={FIGMA_HOME_HERO}>
        <div className={FIGMA_HOME_HERO_GLOW_CENTER} aria-hidden />
        <div className={FIGMA_HOME_HERO_GLOW_LEFT} aria-hidden />
        <div className={FIGMA_HOME_HERO_GLOW_RIGHT} aria-hidden />

        <div className="relative z-10">
          <div className={FIGMA_HOME_HERO_BADGE}>
            <div className={FIGMA_HOME_HERO_BADGE_ICON}>
              <Sparkles className="h-[11px] w-[11px] text-primary-foreground" aria-hidden />
            </div>
            <FloatingHeroMockup isDarkMode={isDarkMode} labels={copy.mock.floating} />
          </div>
        </section>

        {/* 2) PROBLEM → SOLUTION */}
        <section
          className={`border-y py-20 sm:py-24 lg:py-28 ${isDarkMode ? 'border-white/5 bg-slate-950/50' : 'border-slate-200/80 bg-white/60'}`}
        >
          <div className={`${pageMax} grid gap-12 lg:grid-cols-2 lg:items-start lg:gap-20`}>
            <div>
              <p className={`text-xs font-bold uppercase tracking-[0.2em] ${isDarkMode ? 'text-rose-400/90' : 'text-rose-600'}`}>
                {copy.problem.labelProblem}
              </p>
              <h2 className={`mt-3 text-2xl font-bold leading-snug sm:text-3xl lg:text-4xl ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                {copy.problem.titleProblem}
              </h2>
              <p className={`mt-4 text-base leading-[1.75] sm:text-lg ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                {copy.problem.bodyProblem}
              </p>
            </div>
            <div className="relative">
              <div className={`absolute left-0 top-8 hidden h-[calc(100%-2rem)] w-px bg-gradient-to-b from-cyan-500/0 via-cyan-500/50 to-teal-500/0 lg:block`} aria-hidden />
              <p className={`text-xs font-bold uppercase tracking-[0.2em] ${isDarkMode ? 'text-cyan-400' : 'text-cyan-700'}`}>
                {copy.problem.labelSolution}
              </p>
              <h2 className={`mt-3 text-2xl font-bold leading-snug sm:text-3xl lg:text-4xl ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                {copy.problem.titleSolution}
              </h2>
              <p className={`mt-4 text-base leading-[1.75] sm:text-lg ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                {copy.problem.bodySolution}
              </p>
            </div>
          </div>
        </section>

        {/* 3) FEATURE STORY — timeline + preview */}
        <section id="features-story" className={`scroll-mt-28 py-20 sm:py-24 lg:py-28 ${pageMax}`}>
          <div className="mb-12 max-w-3xl">
            <p className={`text-xs font-bold uppercase tracking-[0.2em] ${isDarkMode ? 'text-slate-500' : 'text-slate-600'}`}>
              {copy.featuresSection.kicker}
            </p>
            <h2 className={`mt-2 text-3xl font-bold tracking-tight sm:text-4xl ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
              {copy.featuresSection.title}
            </h2>
            <p
              className={`mt-4 max-w-2xl whitespace-pre-line text-[15px] leading-[1.65] sm:text-[17px] sm:leading-relaxed ${isDarkMode ? 'text-slate-300' : 'text-slate-800'}`}
            >
              {copy.featuresSection.subtitle}
            </p>
          </div>
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-12">
            <div className="space-y-2">
              {copy.storySteps.map(({ step, headline, teaser, featureId }) => {
                const active = storyFocusId === featureId;
                return (
                  <button
                    key={featureId}
                    type="button"
                    onMouseEnter={() => setStoryFocusId(featureId)}
                    onFocus={() => setStoryFocusId(featureId)}
                    onClick={() => setSelectedFeatureId(featureId)}
                    className={`group w-full rounded-2xl border px-4 py-4 text-left transition sm:px-5 sm:py-4 ${
                      active
                        ? isDarkMode
                          ? 'border-cyan-500/40 bg-cyan-950/40 shadow-[0_0_32px_-8px_rgba(34,211,238,0.25)]'
                          : 'border-cyan-400/60 bg-cyan-50/90 shadow-md'
                        : isDarkMode
                          ? 'border-transparent bg-white/[0.03] hover:border-white/10 hover:bg-white/[0.06]'
                          : 'border-transparent bg-white hover:border-slate-200 hover:shadow-sm'
                    }`}
                  >
                    <div className="flex gap-4">
                      <span
                        className={`font-mono text-sm font-bold tabular-nums sm:text-base ${
                          active ? 'text-cyan-400' : isDarkMode ? 'text-slate-600 group-hover:text-slate-400' : 'text-slate-400'
                        }`}
                      >
                        {step}
                      </span>
                      <div className="min-w-0 flex-1">
                        <h3 className={`text-base font-bold sm:text-lg ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{headline}</h3>
                        <p className={`mt-1 text-sm leading-snug ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>{teaser}</p>
                        <span className={`mt-2 inline-block text-xs font-semibold ${active ? 'text-cyan-300' : 'text-cyan-600/80'}`}>
                          {copy.featuresSection.clickHint}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="lg:sticky lg:top-28">
              <LandingFeatureEmbed featureId={storyFocusId} />
            </div>
          </div>
        </section>

        {/* 4) USER JOURNEY */}
        <section className={`border-y py-20 sm:py-24 lg:py-28 ${isDarkMode ? 'border-white/5 bg-slate-950/40' : 'border-slate-200/80 bg-slate-50/80'}`}>
          <div className={pageMax}>
            <h2 className={`text-center text-2xl font-bold sm:text-3xl ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
              {copy.userJourney.title}
            </h2>
            <p className={`mx-auto mt-3 max-w-2xl text-center text-base ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
              {copy.userJourney.subtitle}
            </p>
            <div className="mt-12 flex flex-col items-stretch gap-4 md:flex-row md:flex-nowrap md:items-start md:justify-center md:gap-0">
              {copy.userJourney.steps.map((item, idx) => (
                <Fragment key={item.title}>
                  <div className="flex flex-col items-center text-center md:w-40 md:shrink-0 lg:w-44">
                    <div
                      className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-lg font-black text-white shadow-lg ${
                        isDarkMode ? 'bg-gradient-to-br from-cyan-500 to-teal-600' : 'bg-gradient-to-br from-cyan-600 to-teal-600'
                      }`}
                    >
                      {idx + 1}
                    </div>
                    <h3 className={`mt-4 text-base font-bold sm:text-lg ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{item.title}</h3>
                    <p className={`mt-1 max-w-[14rem] text-sm leading-relaxed ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>{item.desc}</p>
                  </div>
                  {idx < copy.userJourney.steps.length - 1 ? (
                    <div
                      className="flex shrink-0 items-center justify-center py-1 md:mt-7 md:w-10 md:py-0 lg:w-12"
                      aria-hidden
                    >
                      <span
                        className={`text-2xl font-light leading-none md:text-xl ${isDarkMode ? 'text-cyan-500/55' : 'text-cyan-500/70'}`}
                      >
                        <span className="md:hidden">↓</span>
                        <span className="hidden md:inline">→</span>
                      </span>
                    </div>
                  ) : null}
                </Fragment>
              ))}
            </div>
          </div>
        </section>

        <div className={FIGMA_HOME_TESTIMONIAL_GRID}>
          {landing.testimonials.items.map((testimonial, index) => (
            <div
              key={testimonial.name}
              className={FIGMA_HOME_TESTIMONIAL_CARD}
              style={{
                background: index === activeTestimonial ? 'rgba(37,99,235,0.08)' : undefined,
                borderColor: index === activeTestimonial ? 'rgba(37,99,235,0.25)' : undefined,
              }}
            >
              <div className={FIGMA_HOME_TESTIMONIAL_STARS}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <Star key={star} className="h-[13px] w-[13px] text-warning" fill="#F59E0B" aria-hidden />
                ))}
              </div>
            ) : null}
            <p className={`text-xs leading-relaxed ${isDarkMode ? 'text-slate-500' : 'text-slate-500'}`}>
              {copy.modal.footerNote}
            </p>
            <div className={`flex flex-wrap gap-2 border-t pt-5 ${isDarkMode ? 'border-white/10' : 'border-slate-200'}`}>
              {isAuthenticated ? (
                <GradientButton
                  variant="primary"
                  type="button"
                  className="rounded-xl bg-gradient-to-r from-cyan-600 to-teal-600 px-4 py-2 text-sm font-bold"
                  onClick={() => {
                    closeModal();
                    navigate('/app');
                  }}
                >
                  {testimonial.avatar}
                </div>
                <div>
                  <div className={FIGMA_HOME_TESTIMONIAL_NAME}>{testimonial.name}</div>
                  <div className={FIGMA_HOME_TESTIMONIAL_ROLE}>{testimonial.role}</div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className={FIGMA_HOME_TESTIMONIAL_DOTS}>
          {landing.testimonials.items.map((testimonial, index) => (
            <button
              key={testimonial.name}
              type="button"
              onClick={() => setActiveTestimonial(index)}
              className="h-1.5 rounded-full border-0 p-0 vh-transition"
              style={{
                width: index === activeTestimonial ? '20px' : '6px',
                background: index === activeTestimonial ? '#2563EB' : 'rgba(255,255,255,0.15)',
              }}
              aria-label={`Testimonial ${index + 1}`}
            />
          ))}
        </div>
      </section>

      <section id="techstack-section" className={FIGMA_HOME_TECH}>
        <div className={FIGMA_HOME_TECH_CARD}>
          <div className={FIGMA_HOME_TECH_GLOW} aria-hidden />
          <div className="relative z-10">
            <div className={FIGMA_HOME_TECH_KICKER_ROW}>
              <Lock className="h-[15px] w-[15px] text-primary" aria-hidden />
              <span className={FIGMA_HOME_KICKER_TEXT}>{landing.techStack.kicker}</span>
            </div>
            <h3 className={FIGMA_HOME_TECH_TITLE}>{landing.techStack.title}</h3>
            <p className={FIGMA_HOME_TECH_SUB}>{landing.techStack.subtitle}</p>
            <div className={FIGMA_HOME_TECH_TAGS}>
              {landing.techStack.items.map((tech) => (
                <span key={tech} className={FIGMA_HOME_TECH_TAG}>
                  {tech}
                </span>
              ))}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

export default HomePage;
