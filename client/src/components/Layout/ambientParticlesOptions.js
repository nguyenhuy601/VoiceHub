/**
 * tsparticles options — dark/light presets (tech blue glow, light network links).
 */

export function buildAmbientParticlesOptions(isDarkMode, { reducedMotion = false } = {}) {
  if (reducedMotion) {
    return {
      fullScreen: false,
      fpsLimit: 1,
      particles: { number: { value: 0 } },
      detectRetina: true,
    };
  }

  if (isDarkMode) {
    return {
      fullScreen: false,
      background: { color: { value: 'transparent' } },
      fpsLimit: 30,
      detectRetina: true,
      particles: {
        number: { value: 52, density: { enable: true, width: 1200, height: 800 } },
        color: { value: ['#38bdf8', '#67e8f9', '#7dd3fc', '#22d3ee'] },
        links: {
          enable: true,
          color: '#38bdf8',
          distance: 140,
          opacity: 0.22,
          width: 1,
        },
        move: {
          enable: true,
          speed: 0.55,
          direction: 'none',
          outModes: { default: 'out' },
        },
        opacity: {
          value: { min: 0.2, max: 0.65 },
          animation: { enable: true, speed: 0.6, sync: false },
        },
        size: { value: { min: 1, max: 2.6 } },
        shape: { type: 'circle' },
      },
      interactivity: {
        detectsOn: 'window',
        events: {
          onHover: { enable: false },
          onClick: { enable: false },
          resize: { enable: true },
        },
      },
    };
  }

  return {
    fullScreen: false,
    background: { color: { value: 'transparent' } },
    fpsLimit: 30,
    detectRetina: true,
    particles: {
      number: { value: 30, density: { enable: true, width: 1200, height: 800 } },
      color: { value: ['#64748b', '#38bdf8', '#94a3b8', '#0ea5e9'] },
      links: {
        enable: true,
        color: '#94a3b8',
        distance: 130,
        opacity: 0.14,
        width: 1,
      },
      move: {
        enable: true,
        speed: 0.35,
        direction: 'none',
        outModes: { default: 'out' },
      },
      opacity: {
        value: { min: 0.12, max: 0.4 },
        animation: { enable: true, speed: 0.4, sync: false },
      },
      size: { value: { min: 1, max: 2.2 } },
      shape: { type: 'circle' },
    },
    interactivity: {
      detectsOn: 'window',
      events: {
        onHover: { enable: false },
        onClick: { enable: false },
        resize: { enable: true },
      },
    },
  };
}
