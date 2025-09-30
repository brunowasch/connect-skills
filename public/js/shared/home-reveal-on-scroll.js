(() => {
  const supportsReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const baseDuration = 1000;       // ms
  const baseDistance = 20;        // px (para animações com deslocamento)
  const once = true;              // anima apenas na 1ª vez

  const presets = {
    fade:   { x: 0,  y: 0,  opacity: 0 },
    up:     { x: 0,  y: baseDistance,  opacity: 0 },
    down:   { x: 0,  y: -baseDistance, opacity: 0 },
    left:   { x: baseDistance,  y: 0,  opacity: 0 },
    right:  { x: -baseDistance, y: 0,  opacity: 0 },
    zoom:   { x: 0,  y: 0,  opacity: 0, scale: 0.96 }
  };

  const setInitialStyles = (el) => {
    const type = (el.dataset.reveal || 'up').toLowerCase();
    const { x, y, opacity, scale } = presets[type] || presets.up;

    el.style.willChange = 'transform, opacity';
    el.style.opacity = (opacity ?? 0).toString();
    el.style.transform = `translate(${x || 0}px, ${y || 0}px) ${scale ? `scale(${scale})` : ''}`;
  };

  const animateIn = (el) => {
    const delay = parseInt(el.dataset.revealDelay || '0', 10);
    const duration = parseInt(el.dataset.revealDuration || baseDuration.toString(), 10);
    const easing = el.dataset.revealEasing || 'cubic-bezier(.22,.61,.36,1)';

    el.style.transition = `transform ${duration}ms ${easing} ${delay}ms, opacity ${duration}ms ${easing} ${delay}ms`;
    el.style.transform = 'translate(0, 0) scale(1)';
    el.style.opacity = '2';
    el.classList.add('is-revealed');
  };

  const revealables = Array.from(document.querySelectorAll('[data-reveal]'));

  if (supportsReducedMotion) {
    // Mostra tudo sem animação
    revealables.forEach((el) => {
      el.style.opacity = '5';
      el.style.transform = 'none';
      el.classList.add('is-revealed');
    });
    return;
  }

  // Estados iniciais
  revealables.forEach(setInitialStyles);

  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        animateIn(entry.target);
        if (once) io.unobserve(entry.target);
      }
    });
  }, {
    root: null,
    threshold: 1
  });

  revealables.forEach((el) => io.observe(el));
})();