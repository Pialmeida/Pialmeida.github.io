// Project cards open a detail dialog on click. Content is cloned from the card
// itself (so there's one source of truth for the copy); the Fourier-fingerprint
// card additionally gets the live descriptor demo from js/fourier.js.
(() => {
  const modal = document.getElementById('project-modal');
  const projectsGrid = document.querySelector('.projects');
  if (!modal || !projectsGrid) return;

  const artEl = modal.querySelector('.project-modal-art');
  const kickerEl = modal.querySelector('.project-modal-kicker');
  const titleEl = modal.querySelector('#project-modal-title');
  const textEl = modal.querySelector('.project-modal-text');
  const tagsEl = modal.querySelector('.project-modal-tags');
  const extraEl = modal.querySelector('.project-modal-extra');
  const closeBtn = modal.querySelector('.project-modal-close');
  const fourierTemplate = document.getElementById('fourier-demo-template');

  let lastTrigger = null;

  function openProject(card) {
    const art = card.querySelector('.project-art');
    artEl.innerHTML = art ? art.innerHTML : '';
    kickerEl.textContent = card.querySelector('.project-kicker')?.textContent || '';
    titleEl.textContent = card.querySelector('h3')?.textContent || '';

    textEl.innerHTML = '';
    card.querySelectorAll('.project-body > p:not(.project-kicker)').forEach(p => textEl.appendChild(p.cloneNode(true)));

    tagsEl.innerHTML = card.querySelector('.tags')?.innerHTML || '';

    extraEl.innerHTML = '';
    if (card.dataset.project === 'fourier-fingerprint' && fourierTemplate) {
      extraEl.appendChild(fourierTemplate.content.cloneNode(true));
      window.FourierDemo?.init(extraEl);
    }

    lastTrigger = document.activeElement;
    modal.showModal();
    closeBtn.focus();
  }

  projectsGrid.addEventListener('click', e => {
    const card = e.target.closest('.project[data-project]');
    if (card) openProject(card);
  });

  closeBtn.addEventListener('click', () => modal.close());

  // Click on the backdrop (outside the dialog's own box) closes it.
  modal.addEventListener('click', e => {
    const r = modal.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) modal.close();
  });

  modal.addEventListener('close', () => { lastTrigger?.focus(); });
})();
