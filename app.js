(() => {
  'use strict';

  const STORAGE_PORTIONS_KEY = 'przepisy_portions_v1';
  const STORAGE_DAY_PLAN_KEY = 'przepisy_day_plan_v1';
  const STORAGE_IOS_BANNER_DISMISSED_KEY = 'przepisy_ios_banner_dismissed_v1';

  const CATEGORY_STYLES = {
    sniadanie: {
      badge: 'bg-amber-100 text-amber-800 border border-amber-200',
      imgBg: 'from-amber-50/80 via-stone-50 to-orange-50/60',
      icon: '☀️',
    },
    obiad: {
      badge: 'bg-emerald-100 text-emerald-800 border border-emerald-200',
      imgBg: 'from-emerald-50/70 via-stone-50 to-teal-50/50',
      icon: '🍽️',
    },
    kolacja: {
      badge: 'bg-indigo-100 text-indigo-800 border border-indigo-200',
      imgBg: 'from-indigo-50/70 via-stone-50 to-sky-50/50',
      icon: '🌙',
    },
  };

  const state = {
    meta: null,
    categories: [],
    recipes: [],
    recipesById: new Map(),
    activeCategory: 'all',
    searchQuery: '',
    kcalFilter: 'all',
    sortBy: 'alpha',
    portions: loadJSON(STORAGE_PORTIONS_KEY, {}),
    dayPlan: loadJSON(STORAGE_DAY_PLAN_KEY, []),
    activeRecipeId: null,
  };

  // Elementy DOM
  const els = {
    headerStats: document.getElementById('headerStats'),
    categoryTabs: document.getElementById('categoryTabs'),
    searchInput: document.getElementById('searchInput'),
    kcalFilter: document.getElementById('kcalFilter'),
    sortSelect: document.getElementById('sortSelect'),
    resultsCount: document.getElementById('resultsCount'),
    resetFiltersBtn: document.getElementById('resetFiltersBtn'),
    resetAllPortionsBtn: document.getElementById('resetAllPortionsBtn'),
    errorBanner: document.getElementById('errorBanner'),
    recipesGrid: document.getElementById('recipesGrid'),
    emptyState: document.getElementById('emptyState'),
    emptyResetBtn: document.getElementById('emptyResetBtn'),

    // Modal przepisu
    recipeModal: document.getElementById('recipeModal'),
    modalBackdrop: document.getElementById('modalBackdrop'),
    closeModalBtn: document.getElementById('closeModalBtn'),
    closeModalFooterBtn: document.getElementById('closeModalFooterBtn'),
    modalImageWrap: document.getElementById('modalImageWrap'),
    modalImage: document.getElementById('modalImage'),
    modalCategoryBadge: document.getElementById('modalCategoryBadge'),
    modalTimeRange: document.getElementById('modalTimeRange'),
    modalSource: document.getElementById('modalSource'),
    modalTitle: document.getElementById('modalTitle'),
    portionMinusBtn: document.getElementById('portionMinusBtn'),
    portionPlusBtn: document.getElementById('portionPlusBtn'),
    portionInput: document.getElementById('portionInput'),
    portionPresets: document.getElementById('portionPresets'),
    modalResetPortionBtn: document.getElementById('modalResetPortionBtn'),
    modalKcal: document.getElementById('modalKcal'),
    modalProtein: document.getElementById('modalProtein'),
    modalCarbs: document.getElementById('modalCarbs'),
    modalFat: document.getElementById('modalFat'),
    modalBaseNote: document.getElementById('modalBaseNote'),
    modalIngredients: document.getElementById('modalIngredients'),
    modalSteps: document.getElementById('modalSteps'),
    copyIngredientsBtn: document.getElementById('copyIngredientsBtn'),
    modalAddToPlanBtn: document.getElementById('modalAddToPlanBtn'),

    // Plan dnia
    openDayPlanBtn: document.getElementById('openDayPlanBtn'),
    dayPlanBadge: document.getElementById('dayPlanBadge'),
    dayPlanKcalHeader: document.getElementById('dayPlanKcalHeader'),
    dayPlanBar: document.getElementById('dayPlanBar'),
    barCount: document.getElementById('barCount'),
    barKcal: document.getElementById('barKcal'),
    barProtein: document.getElementById('barProtein'),
    barCarbs: document.getElementById('barCarbs'),
    barFat: document.getElementById('barFat'),
    barOpenBtn: document.getElementById('barOpenBtn'),
    dayPlanDrawer: document.getElementById('dayPlanDrawer'),
    dayPlanBackdrop: document.getElementById('dayPlanBackdrop'),
    closeDayPlanBtn: document.getElementById('closeDayPlanBtn'),
    closeDayPlanFooterBtn: document.getElementById('closeDayPlanFooterBtn'),
    drawerKcal: document.getElementById('drawerKcal'),
    drawerProtein: document.getElementById('drawerProtein'),
    drawerCarbs: document.getElementById('drawerCarbs'),
    drawerFat: document.getElementById('drawerFat'),
    dayPlanList: document.getElementById('dayPlanList'),
    clearDayPlanBtn: document.getElementById('clearDayPlanBtn'),

    // PWA / Offline
    offlineStatusBtn: document.getElementById('offlineStatusBtn'),
    offlineStatusDot: document.getElementById('offlineStatusDot'),
    offlineStatusText: document.getElementById('offlineStatusText'),
    iosInstallBanner: document.getElementById('iosInstallBanner'),
    dismissIosBannerBtn: document.getElementById('dismissIosBannerBtn'),
  };

  const offlineState = {
    supported: false,
    online: typeof navigator !== 'undefined' ? navigator.onLine !== false : true,
    cached: 0,
    total: 0,
    done: false,
    syncing: false,
  };

  function loadJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (_) {
      return fallback;
    }
  }

  function saveJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (_) {
      // Ignoruj błędy limitu / trybu prywatnego
    }
  }

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function normalizeSearch(str) {
    return String(str ?? '')
      .toLowerCase()
      .replace(/ł/g, 'l')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  }

  function clampPortions(val) {
    const num = Number(val);
    if (!Number.isFinite(num) || num <= 0) return 1;
    return Math.min(20, Math.max(0.25, Math.round(num * 100) / 100));
  }

  function getPortions(recipeId) {
    const saved = state.portions[recipeId];
    return saved ? clampPortions(saved) : 1;
  }

  function setPortions(recipeId, val) {
    const clamped = clampPortions(val);
    if (Math.abs(clamped - 1) < 0.001) {
      delete state.portions[recipeId];
    } else {
      state.portions[recipeId] = clamped;
    }
    saveJSON(STORAGE_PORTIONS_KEY, state.portions);
  }

  function formatQty(num) {
    if (num === null || num === undefined || !Number.isFinite(num)) return '';
    const rounded = Math.round(num * 100) / 100;
    return rounded.toString().replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
  }

  function formatPortionLabel(p) {
    const formatted = formatQty(p);
    if (p === 1) return '1 porcja';
    if (p >= 2 && p <= 4 && Number.isInteger(p)) return `${formatted} porcje`;
    return `${formatted} porcji`;
  }

  function scaledNutrition(recipe, portions) {
    const n = recipe.nutrition || { kcal: 0, protein: 0, carbs: 0, fat: 0 };
    return {
      kcal: Math.round(n.kcal * portions),
      protein: Math.round(n.protein * portions),
      carbs: Math.round(n.carbs * portions),
      fat: Math.round(n.fat * portions),
    };
  }

  function formatScaledIngredient(ing, portions) {
    if (ing.type === 'section') {
      return { isSection: true, name: ing.name, qtyText: '' };
    }

    if (ing.amount === null || ing.amount === undefined) {
      return { isSection: false, name: ing.name, qtyText: ing.unit || '' };
    }

    const scaledAmount = formatQty(ing.amount * portions);
    const unit = (ing.unit || '').trim();
    const unitLower = unit.toLowerCase();
    const gUnit = (ing.gramsUnit || 'g').toLowerCase();

    let qtyText = unit ? `${scaledAmount} ${unit}` : scaledAmount;
    if (ing.grams !== null && ing.grams !== undefined && unitLower !== gUnit) {
      const scaledGrams = formatQty(ing.grams * portions);
      qtyText += ` (${scaledGrams} ${gUnit})`;
    }

    return { isSection: false, name: ing.name, qtyText };
  }

  async function loadRecipesData() {
    try {
      const res = await fetch('./data/recipes.json');
      if (res.ok) {
        return await res.json();
      }
    } catch (_) {
      // Oczekiwany fallback przy otwieraniu lokalnie przez file:// lub offline przed cache
    }
    if (window.RECIPES_DATA) {
      return window.RECIPES_DATA;
    }
    throw new Error(
      'Nie udało się wczytać bazy data/recipes.json. Uruchom skrypt ekstraktora lub otwórz stronę przez lokalny serwer HTTP.'
    );
  }

  function buildSearchIndex(recipes) {
    for (const r of recipes) {
      const ingText = (r.ingredients || [])
        .filter((i) => i.type === 'item')
        .map((i) => i.name)
        .join(' ');
      r._searchText = normalizeSearch(`${r.title} ${ingText}`);
      r._ingredientCount = (r.ingredients || []).filter((i) => i.type === 'item').length;
    }
  }

  function getFilteredRecipes() {
    const q = normalizeSearch(state.searchQuery);
    const tokens = q ? q.split(/\s+/).filter(Boolean) : [];

    const filtered = state.recipes.filter((r) => {
      if (state.activeCategory !== 'all' && r.category !== state.activeCategory) {
        return false;
      }

      const kcal = scaledNutrition(r, getPortions(r.id)).kcal;
      if (state.kcalFilter === 'under600' && kcal >= 600) return false;
      if (state.kcalFilter === '600to800' && (kcal < 600 || kcal > 800)) return false;
      if (state.kcalFilter === 'over800' && kcal <= 800) return false;

      if (tokens.length > 0) {
        for (const t of tokens) {
          if (!r._searchText.includes(t)) return false;
        }
      }
      return true;
    });

    filtered.sort((a, b) => {
      const na = scaledNutrition(a, getPortions(a.id));
      const nb = scaledNutrition(b, getPortions(b.id));
      if (state.sortBy === 'kcal-asc') return na.kcal - nb.kcal;
      if (state.sortBy === 'kcal-desc') return nb.kcal - na.kcal;
      if (state.sortBy === 'protein-desc') return nb.protein - na.protein;
      return a.title.localeCompare(b.title, 'pl', { sensitivity: 'base' });
    });

    return filtered;
  }

  function renderHeader() {
    const stats = state.meta?.stats;
    if (!stats) {
      els.headerStats.textContent = `${state.recipes.length} przepisów w bazie JSON`;
      return;
    }
    els.headerStats.textContent = `${stats.uniqueRecipes} unikalnych przepisów · usunięto ${stats.duplicatesRemoved} duplikatów z ${state.meta.pdfCount} plików PDF`;
  }

  function renderCategoryTabs() {
    const counts = { all: state.recipes.length, sniadanie: 0, obiad: 0, kolacja: 0 };
    for (const r of state.recipes) {
      if (counts[r.category] !== undefined) counts[r.category] += 1;
    }

    const tabs = [
      { id: 'all', label: 'Wszystkie', icon: '📚', count: counts.all },
      { id: 'sniadanie', label: 'Śniadania', icon: '☀️', count: counts.sniadanie },
      { id: 'obiad', label: 'Obiady', icon: '🍽️', count: counts.obiad },
      { id: 'kolacja', label: 'Kolacje', icon: '🌙', count: counts.kolacja },
    ];

    els.categoryTabs.innerHTML = tabs
      .map((tab) => {
        const active = state.activeCategory === tab.id;
        const btnCls = active
          ? 'bg-emerald-600 text-white shadow-sm'
          : 'bg-stone-100 text-stone-700 hover:bg-stone-200';
        const countCls = active
          ? 'bg-emerald-700/80 text-emerald-50'
          : 'bg-white text-stone-600';
        return `
          <button
            type="button"
            data-cat="${tab.id}"
            aria-pressed="${active}"
            class="shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition ${btnCls}"
          >
            <span aria-hidden="true">${tab.icon}</span>
            <span>${escapeHtml(tab.label)}</span>
            <span class="px-2 py-0.5 rounded-lg text-xs font-bold ${countCls}">${tab.count}</span>
          </button>
        `;
      })
      .join('');
  }

  function renderRecipes() {
    const list = getFilteredRecipes();
    const hasFilters =
      state.activeCategory !== 'all' ||
      state.searchQuery.trim() !== '' ||
      state.kcalFilter !== 'all';
    const hasCustomPortions = Object.keys(state.portions).length > 0;

    els.resetFiltersBtn.classList.toggle('hidden', !hasFilters);
    els.resetAllPortionsBtn.classList.toggle('hidden', !hasCustomPortions);

    const suffix = list.length === 1 ? 'przepis' : list.length >= 2 && list.length <= 4 ? 'przepisy' : 'przepisów';
    els.resultsCount.textContent = `Wyświetlono ${list.length} ${suffix} (z ${state.recipes.length})`;

    if (list.length === 0) {
      els.recipesGrid.innerHTML = '';
      els.emptyState.classList.remove('hidden');
      return;
    }

    els.emptyState.classList.add('hidden');
    els.recipesGrid.innerHTML = list
      .map((r) => {
        const portions = getPortions(r.id);
        const macro = scaledNutrition(r, portions);
        const style = CATEGORY_STYLES[r.category] || CATEGORY_STYLES.obiad;
        const portionPill =
          portions !== 1
            ? `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-stone-900 text-white">${escapeHtml(formatQty(portions))}× porcja</span>`
            : '';

        const imageHeader = r.image
          ? `
            <div class="relative h-44 bg-gradient-to-br ${style.imgBg} border-b border-stone-100 flex items-center justify-center p-4 overflow-hidden">
              <img
                src="./${escapeHtml(r.image)}"
                alt="${escapeHtml(r.title)}"
                loading="lazy"
                decoding="async"
                class="max-h-full max-w-full object-contain drop-shadow-md group-hover:scale-105 transition-transform duration-300"
              />
              <span class="absolute top-3 left-3 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold shadow-sm ${style.badge}">
                <span aria-hidden="true">${style.icon}</span>
                ${escapeHtml(r.categoryLabel)}
              </span>
              <div class="absolute top-3 right-3 flex items-center gap-1.5">
                ${portionPill}
                <span class="text-xs sm:text-sm font-extrabold text-amber-900 bg-white/95 backdrop-blur border border-amber-200 px-2.5 py-0.5 rounded-full shadow-sm">
                  ${macro.kcal} kcal
                </span>
              </div>
            </div>
          `
          : `
            <div class="px-5 pt-5 flex items-center justify-between gap-2">
              <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${style.badge}">
                <span aria-hidden="true">${style.icon}</span>
                ${escapeHtml(r.categoryLabel)}
              </span>
              <div class="flex items-center gap-1.5">
                ${portionPill}
                <span class="text-sm font-extrabold text-amber-800 bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-full">
                  ${macro.kcal} kcal
                </span>
              </div>
            </div>
          `;

        return `
          <article
            data-recipe-id="${escapeHtml(r.id)}"
            class="recipe-card group bg-white rounded-2xl border border-stone-200 overflow-hidden shadow-sm hover:shadow-md hover:border-emerald-300 transition flex flex-col justify-between cursor-pointer"
          >
            <div>
              ${imageHeader}
              <div class="px-5 pt-4 pb-3">
                <h3 class="text-base font-bold text-stone-900 group-hover:text-emerald-700 transition leading-snug">
                  ${escapeHtml(r.title)}
                </h3>
              </div>
            </div>

            <div class="px-5 pb-5">
              <div class="grid grid-cols-3 gap-1.5 text-center text-xs mb-3">
                <div class="py-1.5 rounded-lg bg-rose-50/70 text-rose-900">
                  <span class="text-rose-600 font-medium">B</span> <strong>${macro.protein} g</strong>
                </div>
                <div class="py-1.5 rounded-lg bg-sky-50/70 text-sky-900">
                  <span class="text-sky-600 font-medium">W</span> <strong>${macro.carbs} g</strong>
                </div>
                <div class="py-1.5 rounded-lg bg-emerald-50/70 text-emerald-900">
                  <span class="text-emerald-600 font-medium">T</span> <strong>${macro.fat} g</strong>
                </div>
              </div>

              <div class="pt-3 border-t border-stone-100 flex items-center justify-between text-xs text-stone-500">
                <span>${r._ingredientCount} składników · ${r.steps.length} kroków</span>
                <button
                  type="button"
                  data-add-plan="${escapeHtml(r.id)}"
                  class="add-plan-btn px-2.5 py-1 rounded-lg bg-stone-100 hover:bg-emerald-600 hover:text-white text-stone-700 font-semibold transition"
                >
                  + Do dnia
                </button>
              </div>
            </div>
          </article>
        `;
      })
      .join('');
  }

  function openModal(recipeId) {
    const recipe = state.recipesById.get(recipeId);
    if (!recipe) return;

    state.activeRecipeId = recipeId;
    renderModalContent();
    els.recipeModal.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
  }

  function closeModal() {
    state.activeRecipeId = null;
    els.recipeModal.classList.add('hidden');
    if (els.dayPlanDrawer.classList.contains('hidden')) {
      document.body.classList.remove('overflow-hidden');
    }
  }

  function renderModalContent() {
    const recipe = state.recipesById.get(state.activeRecipeId);
    if (!recipe) return;

    const portions = getPortions(recipe.id);
    const macro = scaledNutrition(recipe, portions);
    const style = CATEGORY_STYLES[recipe.category] || CATEGORY_STYLES.obiad;

    if (recipe.image) {
      els.modalImage.src = `./${recipe.image}`;
      els.modalImage.alt = recipe.title;
      els.modalImageWrap.classList.remove('hidden');
    } else {
      els.modalImage.src = '';
      els.modalImageWrap.classList.add('hidden');
    }

    els.modalCategoryBadge.className = `inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${style.badge}`;
    els.modalCategoryBadge.innerHTML = `<span aria-hidden="true">${style.icon}</span> ${escapeHtml(recipe.categoryLabel)}`;
    els.modalTimeRange.textContent = recipe.timeRange ? `Pora: ${recipe.timeRange}` : '';
    els.modalSource.textContent = recipe.sourceFile ? `Źródło: ${recipe.sourceFile}` : '';
    els.modalTitle.textContent = recipe.title;

    els.portionInput.value = formatQty(portions);
    els.modalResetPortionBtn.classList.toggle('hidden', portions === 1);

    // Podświetlenie aktywnego presetu porcji
    els.portionPresets.querySelectorAll('.portion-preset').forEach((btn) => {
      const val = Number(btn.dataset.portion);
      const isSelected = Math.abs(val - portions) < 0.001;
      btn.className = isSelected
        ? 'portion-preset px-2.5 py-1.5 rounded-lg text-xs font-bold border bg-emerald-600 text-white border-emerald-600 transition'
        : 'portion-preset px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-stone-200 bg-white text-stone-700 hover:border-emerald-400 transition';
    });

    els.modalKcal.textContent = `${macro.kcal}`;
    els.modalProtein.textContent = `${macro.protein} g`;
    els.modalCarbs.textContent = `${macro.carbs} g`;
    els.modalFat.textContent = `${macro.fat} g`;

    if (portions !== 1) {
      els.modalBaseNote.classList.remove('hidden');
      els.modalBaseNote.textContent = `Wartości dla ${formatPortionLabel(portions)} (1 porcja bazowa: ${recipe.nutrition.kcal} kcal, B: ${recipe.nutrition.protein} g, W: ${recipe.nutrition.carbs} g, T: ${recipe.nutrition.fat} g).`;
    } else {
      els.modalBaseNote.classList.add('hidden');
    }

    // Składniki z checkboxami
    els.modalIngredients.innerHTML = recipe.ingredients
      .map((ing, idx) => {
        const formatted = formatScaledIngredient(ing, portions);
        if (formatted.isSection) {
          return `<li class="pt-3 pb-1 text-xs font-bold uppercase tracking-wider text-emerald-700 border-b border-stone-100">${escapeHtml(formatted.name)}</li>`;
        }
        return `
          <li class="flex items-start gap-2.5 py-1">
            <input
              id="ing-chk-${idx}"
              type="checkbox"
              class="ing-checkbox mt-1 w-4 h-4 rounded border-stone-300 text-emerald-600 focus:ring-emerald-500 shrink-0 cursor-pointer"
            />
            <label for="ing-chk-${idx}" class="flex-1 flex flex-wrap items-baseline justify-between gap-x-2 cursor-pointer select-none">
              <span class="ing-label text-stone-800">${escapeHtml(formatted.name)}</span>
              <span class="font-semibold text-stone-900 whitespace-nowrap">${escapeHtml(formatted.qtyText)}</span>
            </label>
          </li>
        `;
      })
      .join('');

    // Kroki przygotowania
    els.modalSteps.innerHTML = recipe.steps
      .map(
        (step, idx) => `
          <li class="flex items-start gap-3">
            <span class="shrink-0 w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold flex items-center justify-center mt-0.5">${idx + 1}</span>
            <span>${escapeHtml(step)}</span>
          </li>
        `
      )
      .join('');

    els.modalAddToPlanBtn.textContent = `+ Dodaj do planu dnia (${formatPortionLabel(portions)})`;
  }

  function updateModalPortions(newVal) {
    if (!state.activeRecipeId) return;
    setPortions(state.activeRecipeId, newVal);
    renderModalContent();
    renderRecipes();
  }

  function copyActiveIngredients() {
    const recipe = state.recipesById.get(state.activeRecipeId);
    if (!recipe) return;
    const portions = getPortions(recipe.id);
    const lines = [`${recipe.title} (${formatPortionLabel(portions)}):`];
    for (const ing of recipe.ingredients) {
      const f = formatScaledIngredient(ing, portions);
      if (f.isSection) {
        lines.push(`\n${f.name}:`);
      } else {
        lines.push(`- ${f.name}${f.qtyText ? ' – ' + f.qtyText : ''}`);
      }
    }
    const text = lines.join('\n');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        const orig = els.copyIngredientsBtn.textContent;
        els.copyIngredientsBtn.textContent = 'Skopiowano ✓';
        setTimeout(() => {
          els.copyIngredientsBtn.textContent = orig;
        }, 1600);
      });
    }
  }

  // Plan dnia
  function addToDayPlan(recipeId, portions) {
    const recipe = state.recipesById.get(recipeId);
    if (!recipe) return;
    state.dayPlan.push({
      uid: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      recipeId,
      portions: clampPortions(portions),
    });
    saveJSON(STORAGE_DAY_PLAN_KEY, state.dayPlan);
    renderDayPlan();
  }

  function removeFromDayPlan(uid) {
    state.dayPlan = state.dayPlan.filter((item) => item.uid !== uid);
    saveJSON(STORAGE_DAY_PLAN_KEY, state.dayPlan);
    renderDayPlan();
  }

  function updateDayPlanPortion(uid, delta) {
    const item = state.dayPlan.find((i) => i.uid === uid);
    if (!item) return;
    item.portions = clampPortions(item.portions + delta);
    saveJSON(STORAGE_DAY_PLAN_KEY, state.dayPlan);
    renderDayPlan();
  }

  function renderDayPlan() {
    // Odrzuć ewentualne stare ID, których nie ma już w bazie
    const validItems = state.dayPlan.filter((item) => state.recipesById.has(item.recipeId));
    if (validItems.length !== state.dayPlan.length) {
      state.dayPlan = validItems;
      saveJSON(STORAGE_DAY_PLAN_KEY, state.dayPlan);
    }

    let totalKcal = 0;
    let totalProtein = 0;
    let totalCarbs = 0;
    let totalFat = 0;

    for (const item of validItems) {
      const r = state.recipesById.get(item.recipeId);
      const m = scaledNutrition(r, item.portions);
      totalKcal += m.kcal;
      totalProtein += m.protein;
      totalCarbs += m.carbs;
      totalFat += m.fat;
    }

    els.dayPlanBadge.textContent = String(validItems.length);
    els.dayPlanKcalHeader.textContent = `${totalKcal} kcal`;
    els.barCount.textContent = String(validItems.length);
    els.barKcal.textContent = String(totalKcal);
    els.barProtein.textContent = `${totalProtein} g`;
    els.barCarbs.textContent = `${totalCarbs} g`;
    els.barFat.textContent = `${totalFat} g`;
    els.dayPlanBar.classList.toggle('hidden', validItems.length === 0);

    els.drawerKcal.textContent = String(totalKcal);
    els.drawerProtein.textContent = `${totalProtein} g`;
    els.drawerCarbs.textContent = `${totalCarbs} g`;
    els.drawerFat.textContent = `${totalFat} g`;

    if (validItems.length === 0) {
      els.dayPlanList.innerHTML = `
        <div class="text-center py-12 text-stone-500 text-sm">
          <div class="text-3xl mb-2" aria-hidden="true">📋</div>
          <p class="font-medium text-stone-700">Twój plan dnia jest pusty</p>
          <p class="text-xs mt-1">Kliknij <strong>+ Do dnia</strong> na dowolnym przepisie, aby zsumować kalorie.</p>
        </div>
      `;
      return;
    }

    els.dayPlanList.innerHTML = validItems
      .map((item) => {
        const r = state.recipesById.get(item.recipeId);
        const m = scaledNutrition(r, item.portions);
        const style = CATEGORY_STYLES[r.category] || CATEGORY_STYLES.obiad;
        const thumb = r.image
          ? `<img src="./${escapeHtml(r.image)}" alt="" class="w-12 h-12 rounded-xl bg-white border border-stone-200 p-1 object-contain shrink-0" />`
          : '';
        return `
          <div class="p-3.5 rounded-xl border border-stone-200 bg-stone-50/60">
            <div class="flex items-start justify-between gap-2">
              <button type="button" data-open-recipe="${escapeHtml(r.id)}" class="text-left group flex items-center gap-3 min-w-0">
                ${thumb}
                <div class="min-w-0">
                  <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold mb-1 ${style.badge}">
                    ${escapeHtml(r.categoryLabel)}
                  </span>
                  <div class="text-sm font-bold text-stone-900 group-hover:text-emerald-700 leading-snug">
                    ${escapeHtml(r.title)}
                  </div>
                </div>
              </button>
              <button type="button" data-remove-uid="${escapeHtml(item.uid)}" aria-label="Usuń z planu" class="text-stone-400 hover:text-red-600 text-lg leading-none px-1">&times;</button>
            </div>
            <div class="mt-2.5 flex items-center justify-between gap-2 text-xs">
              <div class="inline-flex items-center rounded-lg border border-stone-300 bg-white overflow-hidden">
                <button type="button" data-plan-minus="${escapeHtml(item.uid)}" class="w-7 h-7 font-bold text-stone-700 hover:bg-stone-100">−</button>
                <span class="px-2 font-semibold text-stone-900">${escapeHtml(formatQty(item.portions))}×</span>
                <button type="button" data-plan-plus="${escapeHtml(item.uid)}" class="w-7 h-7 font-bold text-stone-700 hover:bg-stone-100">+</button>
              </div>
              <div class="text-right">
                <span class="font-bold text-amber-800">${m.kcal} kcal</span>
                <span class="text-stone-500 ml-1">B:${m.protein} W:${m.carbs} T:${m.fat}</span>
              </div>
            </div>
          </div>
        `;
      })
      .join('');
  }

  function openDayPlan() {
    renderDayPlan();
    els.dayPlanDrawer.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
  }

  function closeDayPlan() {
    els.dayPlanDrawer.classList.add('hidden');
    if (els.recipeModal.classList.contains('hidden')) {
      document.body.classList.remove('overflow-hidden');
    }
  }

  function resetFilters() {
    state.activeCategory = 'all';
    state.searchQuery = '';
    state.kcalFilter = 'all';
    els.searchInput.value = '';
    els.kcalFilter.value = 'all';
    renderCategoryTabs();
    renderRecipes();
  }

  function bindEvents() {
    // Zakładki kategorii
    els.categoryTabs.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-cat]');
      if (!btn) return;
      state.activeCategory = btn.dataset.cat;
      renderCategoryTabs();
      renderRecipes();
    });

    // Filtry i sortowanie
    els.searchInput.addEventListener('input', (e) => {
      state.searchQuery = e.target.value;
      renderRecipes();
    });
    els.kcalFilter.addEventListener('change', (e) => {
      state.kcalFilter = e.target.value;
      renderRecipes();
    });
    els.sortSelect.addEventListener('change', (e) => {
      state.sortBy = e.target.value;
      renderRecipes();
    });

    els.resetFiltersBtn.addEventListener('click', resetFilters);
    els.emptyResetBtn.addEventListener('click', resetFilters);
    els.resetAllPortionsBtn.addEventListener('click', () => {
      state.portions = {};
      saveJSON(STORAGE_PORTIONS_KEY, state.portions);
      renderRecipes();
      if (state.activeRecipeId) renderModalContent();
    });

    // Kliknięcie karty przepisu lub przycisku "+ Do dnia"
    els.recipesGrid.addEventListener('click', (e) => {
      const addBtn = e.target.closest('[data-add-plan]');
      if (addBtn) {
        e.stopPropagation();
        const id = addBtn.dataset.addPlan;
        addToDayPlan(id, getPortions(id));
        const orig = addBtn.textContent;
        addBtn.textContent = 'Dodano ✓';
        setTimeout(() => {
          addBtn.textContent = orig;
        }, 1000);
        return;
      }
      const card = e.target.closest('[data-recipe-id]');
      if (card) {
        openModal(card.dataset.recipeId);
      }
    });

    // Zamykanie modalu
    els.closeModalBtn.addEventListener('click', closeModal);
    els.closeModalFooterBtn.addEventListener('click', closeModal);
    els.modalBackdrop.addEventListener('click', closeModal);

    // Edycja porcji w modalu
    els.portionMinusBtn.addEventListener('click', () => {
      if (!state.activeRecipeId) return;
      updateModalPortions(getPortions(state.activeRecipeId) - 0.5);
    });
    els.portionPlusBtn.addEventListener('click', () => {
      if (!state.activeRecipeId) return;
      updateModalPortions(getPortions(state.activeRecipeId) + 0.5);
    });
    els.portionInput.addEventListener('change', (e) => {
      updateModalPortions(e.target.value);
    });
    els.portionInput.addEventListener('input', (e) => {
      const parsed = Number(e.target.value);
      if (Number.isFinite(parsed) && parsed >= 0.25 && parsed <= 20) {
        setPortions(state.activeRecipeId, parsed);
        // Odśwież dane bez wyrywania kursora z pola
        const recipe = state.recipesById.get(state.activeRecipeId);
        if (!recipe) return;
        const p = getPortions(recipe.id);
        const macro = scaledNutrition(recipe, p);
        els.modalKcal.textContent = `${macro.kcal}`;
        els.modalProtein.textContent = `${macro.protein} g`;
        els.modalCarbs.textContent = `${macro.carbs} g`;
        els.modalFat.textContent = `${macro.fat} g`;
        els.modalResetPortionBtn.classList.toggle('hidden', p === 1);
        els.modalAddToPlanBtn.textContent = `+ Dodaj do planu dnia (${formatPortionLabel(p)})`;
        // Przelicz etykiety składników zachowując stan checkboxów
        const items = els.modalIngredients.querySelectorAll('li');
        recipe.ingredients.forEach((ing, idx) => {
          if (ing.type === 'item' && items[idx]) {
            const qtyEl = items[idx].querySelector('span.font-semibold');
            if (qtyEl) qtyEl.textContent = formatScaledIngredient(ing, p).qtyText;
          }
        });
        renderRecipes();
      }
    });
    els.portionPresets.addEventListener('click', (e) => {
      const btn = e.target.closest('.portion-preset');
      if (!btn) return;
      updateModalPortions(Number(btn.dataset.portion));
    });
    els.modalResetPortionBtn.addEventListener('click', () => updateModalPortions(1));

    // Przekreślanie odhaczonych składników
    els.modalIngredients.addEventListener('change', (e) => {
      if (!e.target.classList.contains('ing-checkbox')) return;
      const li = e.target.closest('li');
      if (li) {
        li.classList.toggle('opacity-50', e.target.checked);
        li.classList.toggle('line-through', e.target.checked);
      }
    });

    els.copyIngredientsBtn.addEventListener('click', copyActiveIngredients);

    els.modalAddToPlanBtn.addEventListener('click', () => {
      if (!state.activeRecipeId) return;
      addToDayPlan(state.activeRecipeId, getPortions(state.activeRecipeId));
      els.modalAddToPlanBtn.textContent = 'Dodano do planu dnia ✓';
      setTimeout(() => {
        if (state.activeRecipeId) {
          els.modalAddToPlanBtn.textContent = `+ Dodaj do planu dnia (${formatPortionLabel(getPortions(state.activeRecipeId))})`;
        }
      }, 1200);
    });

    // Szuflada planu dnia
    els.openDayPlanBtn.addEventListener('click', openDayPlan);
    els.barOpenBtn.addEventListener('click', openDayPlan);
    els.closeDayPlanBtn.addEventListener('click', closeDayPlan);
    els.closeDayPlanFooterBtn.addEventListener('click', closeDayPlan);
    els.dayPlanBackdrop.addEventListener('click', closeDayPlan);
    els.clearDayPlanBtn.addEventListener('click', () => {
      state.dayPlan = [];
      saveJSON(STORAGE_DAY_PLAN_KEY, state.dayPlan);
      renderDayPlan();
    });
    els.dayPlanList.addEventListener('click', (e) => {
      const rm = e.target.closest('[data-remove-uid]');
      if (rm) return removeFromDayPlan(rm.dataset.removeUid);
      const minus = e.target.closest('[data-plan-minus]');
      if (minus) return updateDayPlanPortion(minus.dataset.planMinus, -0.5);
      const plus = e.target.closest('[data-plan-plus]');
      if (plus) return updateDayPlanPortion(plus.dataset.planPlus, 0.5);
      const openBtn = e.target.closest('[data-open-recipe]');
      if (openBtn) {
        closeDayPlan();
        openModal(openBtn.dataset.openRecipe);
      }
    });

    // Klawisz Escape zamyka aktywny dialog
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (!els.recipeModal.classList.contains('hidden')) {
        closeModal();
      } else if (!els.dayPlanDrawer.classList.contains('hidden')) {
        closeDayPlan();
      }
    });
  }

  function renderOfflineStatus() {
    if (!els.offlineStatusBtn || !offlineState.supported) return;
    els.offlineStatusBtn.classList.remove('hidden');

    const { online, cached, total, done, syncing } = offlineState;
    const baseBtn = 'inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition active:scale-95';

    if (!online) {
      if (done) {
        els.offlineStatusBtn.className = `${baseBtn} border-emerald-200 bg-emerald-50 text-emerald-800`;
        els.offlineStatusDot.className = 'w-2 h-2 rounded-full bg-emerald-500 shrink-0';
        els.offlineStatusText.textContent = 'Tryb offline ✓';
      } else {
        els.offlineStatusBtn.className = `${baseBtn} border-amber-200 bg-amber-50 text-amber-800`;
        els.offlineStatusDot.className = 'w-2 h-2 rounded-full bg-amber-500 shrink-0';
        els.offlineStatusText.textContent = total > 0 ? `Offline (${cached}/${total})` : 'Tryb offline';
      }
      return;
    }

    if (done) {
      els.offlineStatusBtn.className = `${baseBtn} border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100`;
      els.offlineStatusDot.className = 'w-2 h-2 rounded-full bg-emerald-500 shrink-0';
      els.offlineStatusText.textContent = 'Offline gotowe ✓';
    } else if (syncing) {
      els.offlineStatusBtn.className = `${baseBtn} border-sky-200 bg-sky-50 text-sky-800`;
      els.offlineStatusDot.className = 'w-2 h-2 rounded-full bg-sky-500 animate-pulse shrink-0';
      els.offlineStatusText.textContent = total > 0 ? `Pobieram offline ${cached}/${total}…` : 'Przygotowuję offline…';
    } else {
      els.offlineStatusBtn.className = `${baseBtn} border-stone-200 bg-stone-50 text-stone-700 hover:bg-stone-100`;
      els.offlineStatusDot.className = 'w-2 h-2 rounded-full bg-amber-500 shrink-0';
      els.offlineStatusText.textContent = total > 0 ? `Zapisz offline (${cached}/${total})` : 'Zapisz offline';
    }
  }

  function postToServiceWorker(message) {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.ready
      .then((reg) => {
        const target = navigator.serviceWorker.controller || reg.active;
        if (target) target.postMessage(message);
      })
      .catch(() => {});
  }

  function initPWA() {
    // 1. Wskazówka instalacji na iPhonie (Safari, przed dodaniem do ekranu początkowego)
    const isIOS =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isStandalone =
      window.navigator.standalone === true ||
      (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);

    if (els.iosInstallBanner && isIOS && !isStandalone) {
      let dismissed = false;
      try {
        dismissed = localStorage.getItem(STORAGE_IOS_BANNER_DISMISSED_KEY) === '1';
      } catch (_) {}
      if (!dismissed) {
        els.iosInstallBanner.classList.remove('hidden');
      }
    }

    if (els.dismissIosBannerBtn && els.iosInstallBanner) {
      els.dismissIosBannerBtn.addEventListener('click', () => {
        els.iosInstallBanner.classList.add('hidden');
        try {
          localStorage.setItem(STORAGE_IOS_BANNER_DISMISSED_KEY, '1');
        } catch (_) {}
      });
    }

    // 2. Prośba o trwałą pamięć (chroni cache offline przed czyszczeniem przez iOS/przeglądarkę)
    if (navigator.storage && typeof navigator.storage.persist === 'function') {
      navigator.storage.persist().catch(() => {});
    }

    // 3. Rejestracja Service Workera (działa po HTTPS i na localhost; pomijana przy file://)
    const isHttp = window.location.protocol === 'https:' || window.location.protocol === 'http:';
    if (!('serviceWorker' in navigator) || !isHttp) return;

    offlineState.supported = true;
    renderOfflineStatus();

    navigator.serviceWorker.addEventListener('message', (event) => {
      const msg = event.data || {};
      if (msg.type === 'OFFLINE_PROGRESS') {
        offlineState.cached = Number(msg.cached) || 0;
        offlineState.total = Number(msg.total) || 0;
        offlineState.done = Boolean(msg.done);
        offlineState.syncing = Boolean(msg.syncing) && !offlineState.done;
        renderOfflineStatus();
      }
    });

    if (els.offlineStatusBtn) {
      els.offlineStatusBtn.addEventListener('click', () => {
        if (!navigator.onLine) {
          postToServiceWorker({ type: 'GET_OFFLINE_STATUS' });
          return;
        }
        if (!offlineState.done && !offlineState.syncing) {
          offlineState.syncing = true;
          renderOfflineStatus();
          postToServiceWorker({ type: 'CACHE_ALL_IMAGES' });
        } else {
          postToServiceWorker({ type: 'GET_OFFLINE_STATUS' });
        }
      });
    }

    window.addEventListener('online', () => {
      offlineState.online = true;
      renderOfflineStatus();
      if (!offlineState.done) {
        offlineState.syncing = true;
        renderOfflineStatus();
        postToServiceWorker({ type: 'CACHE_ALL_IMAGES' });
      }
    });

    window.addEventListener('offline', () => {
      offlineState.online = false;
      offlineState.syncing = false;
      renderOfflineStatus();
    });

    navigator.serviceWorker
      .register('./sw.js', { scope: './' })
      .then((reg) => {
        reg.addEventListener('updatefound', () => {
          const worker = reg.installing;
          if (!worker) return;
          worker.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) {
              worker.postMessage({ type: 'SKIP_WAITING' });
            }
          });
        });
        return navigator.serviceWorker.ready;
      })
      .then(() => {
        if (navigator.onLine) {
          offlineState.syncing = true;
          renderOfflineStatus();
          postToServiceWorker({ type: 'CACHE_ALL_IMAGES' });
        } else {
          postToServiceWorker({ type: 'GET_OFFLINE_STATUS' });
        }
      })
      .catch(() => {
        offlineState.supported = false;
        if (els.offlineStatusBtn) els.offlineStatusBtn.classList.add('hidden');
      });
  }

  async function init() {
    bindEvents();
    initPWA();
    try {
      const data = await loadRecipesData();
      state.meta = data.meta || null;
      state.categories = data.categories || [];
      state.recipes = Array.isArray(data.recipes) ? data.recipes : [];
      state.recipesById = new Map(state.recipes.map((r) => [r.id, r]));
      buildSearchIndex(state.recipes);

      renderHeader();
      renderCategoryTabs();
      renderRecipes();
      renderDayPlan();
    } catch (err) {
      els.headerStats.textContent = 'Błąd ładowania bazy';
      els.errorBanner.textContent = err.message || String(err);
      els.errorBanner.classList.remove('hidden');
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
