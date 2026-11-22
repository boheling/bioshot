/* Spike helpers. clock(): a strip of 12 blocks along the top that shows the scene timeline's own
   time in 1/120 s (bit 0 on the left), so a rendered frame says which instant it was drawn for. */
window.Spike = (function () {
  const root = (id) => {
    const h = document.getElementById(id);
    if (h && h.classList.contains('spike')) return h;
    return (h && h.querySelector('.spike')) || document.querySelector('.spike') || h;
  };
  function clock(tl, id, seconds) {
    const r = root(id);
    const bar = document.createElement('div');
    bar.style.cssText = 'position:absolute;left:0;top:0;width:1920px;height:60px;z-index:10;display:flex';
    const cells = [];
    for (let i = 0; i < 12; i++) {
      const c = document.createElement('div');
      c.style.cssText = 'width:160px;height:60px;background:#000';
      bar.appendChild(c);
      cells.push(c);
    }
    r.appendChild(bar);
    const paint = () => {
      const n = Math.round(tl.time() * 120);
      cells.forEach((c, i) => { c.style.background = (n >> i) & 1 ? '#fff' : '#000'; });
    };
    tl.to({ v: 0 }, { v: 1, duration: seconds, ease: 'none', onUpdate: paint }, 0);
    paint();
    return r;
  }
  return { root, clock };
})();
