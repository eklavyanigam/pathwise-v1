window.PathwiseSupabaseReady = (async function () {
  const CONFIG = {
    supabaseUrl: 'https://isrvcqvakkzecucyjngd.supabase.co',
    supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlzcnZjcXZha2t6ZWN1Y3lqbmdkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzODU3MjgsImV4cCI6MjA5MDk2MTcyOH0.S34nZVTlPD5yAK7g_IrNBl9jOW-JAz1KZLOk9byv4aU',
    storageKey: 'pw_guest_progress',
    resumeModeKey: 'pw_resume_mode'
  };

  const state = {
    currentProgressId: null,
    guestMode: false,
    session: null,
    introDismissed: false,
    lastSavedAt: null,
    pendingStep: 'setup'
  };

  function setShellVisible(isVisible) {
    document.querySelectorAll('.shell-only').forEach((el) => {
      el.style.display = isVisible ? '' : 'none';
    });
    const header = document.getElementById('app-header');
    if (header) header.style.display = isVisible ? '' : 'none';
  }

  function setResumeMode(mode) {
    try {
      if (!mode) {
        localStorage.removeItem(CONFIG.resumeModeKey);
        return;
      }
      localStorage.setItem(CONFIG.resumeModeKey, mode);
    } catch (error) {}
  }

  function getResumeMode() {
    try {
      return localStorage.getItem(CONFIG.resumeModeKey) || '';
    } catch (error) {
      return '';
    }
  }

  function activatePage(name) {
    const current = document.querySelector('.page.active');
    const next = document.getElementById('page-' + name);
    if (current && current !== next) current.classList.remove('active');
    if (next) next.classList.add('active');
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  function showIntro() {
    activatePage('intro');
    setShellVisible(false);
    const context = document.querySelector('.header-context');
    if (context) context.style.display = 'none';
  }

  function enterAnalyzer(preferredStep) {
    state.introDismissed = true;
    setShellVisible(true);
    const targetStep = isValidStepName(preferredStep) ? preferredStep : getSavedStep();
    state.pendingStep = targetStep;
    if (typeof goToStep === 'function') {
      const nextStep = ((targetStep === 'analysis' || targetStep === 'action') && !lastResults)
        ? 'setup'
        : targetStep;
      goToStep(nextStep);
      return;
    }
    activatePage('setup');
  }

  function renderAuthState(user, isGuest) {
    const accountMenu = document.getElementById('account-menu');
    const accountTrigger = document.getElementById('account-trigger');
    const accountUserLabel = document.getElementById('account-user-label');
    const accountUserMeta = document.getElementById('account-user-meta');
    if (user) {
      state.guestMode = false;
      if (accountMenu) accountMenu.style.display = '';
      if (accountTrigger) accountTrigger.setAttribute('aria-expanded', 'false');
      if (accountUserLabel) accountUserLabel.textContent = user.email || 'Signed-in account';
      if (accountUserMeta) accountUserMeta.textContent = 'Cloud sync active';
      return;
    }
    if (accountMenu) {
      accountMenu.style.display = 'none';
      accountMenu.classList.remove('open');
    }
    if (accountTrigger) accountTrigger.setAttribute('aria-expanded', 'false');
    if (accountUserLabel) accountUserLabel.textContent = 'Account';
    if (accountUserMeta) accountUserMeta.textContent = isGuest ? 'Guest mode active' : 'Cloud sync active';
  }
  function renderSaveStatus(kind, message) {
    return;
  }

  let noticeTimer = null;

  function showTopNotice(kind, title, message, options) {
    const notice = document.getElementById('top-notice');
    const titleEl = document.getElementById('top-notice-title');
    const messageEl = document.getElementById('top-notice-message');
    if (!notice || !titleEl || !messageEl) return;

    const opts = options || {};
    if (noticeTimer) {
      clearTimeout(noticeTimer);
      noticeTimer = null;
    }

    notice.classList.remove('is-info', 'is-success', 'is-error');
    notice.classList.add(kind === 'error' ? 'is-error' : kind === 'success' ? 'is-success' : 'is-info');
    titleEl.textContent = title || 'Notice';
    messageEl.textContent = message || '';
    notice.classList.add('visible');

    if (opts.autoClose !== false) {
      const delay = typeof opts.duration === 'number' ? opts.duration : 4200;
      noticeTimer = setTimeout(() => {
        notice.classList.remove('visible');
        noticeTimer = null;
      }, delay);
    }
  }

  function hideTopNotice() {
    const notice = document.getElementById('top-notice');
    if (!notice) return;
    if (noticeTimer) {
      clearTimeout(noticeTimer);
      noticeTimer = null;
    }
    notice.classList.remove('visible');
  }

  function setButtonBusy(buttonId, busy, busyLabel) {
    const button = document.getElementById(buttonId);
    if (!button) return;
    if (!button.dataset.defaultHtml) {
      button.dataset.defaultHtml = button.innerHTML;
    }
    button.classList.toggle('is-busy', !!busy);
    button.disabled = !!busy;
    if (busy) {
      button.textContent = busyLabel;
    } else {
      button.innerHTML = button.dataset.defaultHtml;
    }
  }

  function setAuthButtonsBusy(mode) {
    setButtonBusy('email-login-btn', mode === 'email', 'Signing In');
    setButtonBusy('email-signup-btn', mode === 'signup', 'Creating');
    setButtonBusy('forgot-password-btn', mode === 'reset', 'Sending');
    setButtonBusy('guest-btn', mode === 'guest', 'Opening');
    setButtonBusy('login-google-btn', mode === 'google', 'Redirecting');
  }


  function readGuestProgress() {
    try {
      const raw = localStorage.getItem(CONFIG.storageKey);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      console.error('Failed to read guest progress', error);
      return null;
    }
  }

  function writeGuestProgress(payload) {
    localStorage.setItem(CONFIG.storageKey, JSON.stringify({
      ...payload,
      saved_at: new Date().toISOString()
    }));
  }

  function clearGuestProgress() {
    localStorage.removeItem(CONFIG.storageKey);
  }

  let supabase = null;
  let bootError = null;

  try {
    const mod = await import('https://esm.sh/@supabase/supabase-js@2');
    supabase = mod.createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });
  } catch (error) {
    bootError = error;
    console.error('Supabase bootstrap failed', error);
  }

  async function getCurrentUser() {
    if (!supabase) return null;
    const { data, error } = await supabase.auth.getUser();
    if (error) throw error;
    return data.user ?? null;
  }

  async function refreshSession() {
    if (!supabase) return null;
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    state.session = data.session ?? null;
    return state.session;
  }

  async function getProgress() {
    const user = await getCurrentUser();

    if (!user) return readGuestProgress();

    const { data, error } = await supabase
      .from('user_progress')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    state.currentProgressId = data?.id ?? null;
    return data ?? null;
  }

  async function updateProgress(id, progress) {
    const user = await getCurrentUser();

    if (!user) {
      writeGuestProgress(progress);
      return progress;
    }

    const { data, error } = await supabase
      .from('user_progress')
      .update({
        selected_role: progress.selected_role,
        skills: progress.skills,
        score: progress.score
      })
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) throw error;
    state.currentProgressId = data.id;
    return data;
  }

  async function saveProgress(progress) {
    const user = await getCurrentUser();

    if (!user) {
      writeGuestProgress(progress);
      return progress;
    }

    if (state.currentProgressId) {
      return updateProgress(state.currentProgressId, progress);
    }

    const { data, error } = await supabase
      .from('user_progress')
      .insert({
        user_id: user.id,
        selected_role: progress.selected_role,
        skills: progress.skills,
        score: progress.score
      })
      .select()
      .single();

    if (error) throw error;
    state.currentProgressId = data.id;
    return data;
  }

  async function mergeGuestProgressToDatabase() {
    const guestProgress = readGuestProgress();
    const user = await getCurrentUser();

    if (!guestProgress || !user) return;

    await saveProgress({
      selected_role: guestProgress.selected_role,
      skills: Array.isArray(guestProgress.skills) ? guestProgress.skills : [],
      score: guestProgress.score ?? null
    });

    clearGuestProgress();
  }

  async function signInWithGoogle() {
    if (!supabase) throw bootError || new Error('Supabase is not configured.');
    return supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin + window.location.pathname
      }
    });
  }

  async function signInWithEmail(email, password) {
    if (!supabase) throw bootError || new Error('Supabase is not configured.');
    return supabase.auth.signInWithPassword({ email, password });
  }

  async function withAuthTimeout(task, timeoutMessage) {
    let timer = null;
    try {
      return await Promise.race([
        task(),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error(timeoutMessage)), 9000);
        })
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async function signUpWithEmail(email, password) {
    if (!supabase) throw bootError || new Error('Supabase is not configured.');
    return supabase.auth.signUp({ email, password });
  }

  async function sendPasswordReset(email) {
    if (!supabase) throw bootError || new Error('Supabase is not configured.');
    return supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + window.location.pathname
    });
  }

  async function signOut() {
    state.guestMode = false;
    state.currentProgressId = null;
    state.introDismissed = false;
    state.pendingStep = 'setup';
    persistStep('setup');
    setResumeMode('');

    if (supabase) {
      await supabase.auth.signOut();
    }

    renderAuthState(null, false);
    renderSaveStatus('saved', 'Signed out');
    showIntro();
  }

  function continueAsGuest() {
    state.guestMode = true;
    setResumeMode('guest');
    renderAuthState(null, true);
    renderSaveStatus('saved', 'Guest progress saves in this browser');
    enterAnalyzer(getSavedStep());
  }

  function getSession() {
    return state.session;
  }

  document.getElementById('login-google-btn')?.addEventListener('click', async () => {
    try {
      setAuthButtonsBusy('google');
      showTopNotice('info', 'Google Sign In', 'Redirecting you to Google...');
      const { error } = await signInWithGoogle();
      if (error) throw error;
    } catch (error) {
      setAuthButtonsBusy('');
      showTopNotice('error', 'Google Sign In Failed', error.message || 'Google login failed.');
    }
  });

  document.getElementById('email-login-btn')?.addEventListener('click', async () => {
    try {
      setAuthButtonsBusy('email');
      const email = document.getElementById('email-input').value.trim();
      const password = document.getElementById('password-input').value;
      if (!email || !password) {
        throw new Error('Enter both email and password to continue.');
      }
      showTopNotice('info', 'Signing In', 'Checking your email and password...');
      const result = await withAuthTimeout(
        () => signInWithEmail(email, password),
        'Email sign in is taking too long. Please try again.'
      );
      if (result.error) throw result.error;
      showTopNotice('success', 'Signed In', 'Opening your analyzer...');
      setAuthButtonsBusy('');
      setTimeout(() => {
        window.location.assign(window.location.pathname);
      }, 280);
    } catch (error) {
      setAuthButtonsBusy('');
      showTopNotice('error', 'Email Access Failed', error.message || 'Email sign in failed.');
    }
  });

  document.getElementById('email-signup-btn')?.addEventListener('click', async () => {
    try {
      setAuthButtonsBusy('signup');
      const email = document.getElementById('email-input').value.trim();
      const password = document.getElementById('password-input').value;
      if (!email || !password) {
        throw new Error('Enter both email and password to create your account.');
      }
      showTopNotice('info', 'Creating Account', 'Setting up your account...');
      const result = await withAuthTimeout(
        () => signUpWithEmail(email, password),
        'Account creation is taking too long. Please try again.'
      );
      if (result.error) throw result.error;

      if (result.data?.session?.user) {
        showTopNotice('success', 'Account Created', 'Opening your analyzer...');
        setAuthButtonsBusy('');
        setTimeout(() => {
          window.location.assign(window.location.pathname);
        }, 280);
      } else {
        setAuthButtonsBusy('');
        showTopNotice('success', 'Account Created', 'Check your email to confirm your account, then sign in.');
      }
    } catch (error) {
      setAuthButtonsBusy('');
      showTopNotice('error', 'Create Account Failed', error.message || 'Could not create your account.');
    }
  });

  document.getElementById('forgot-password-btn')?.addEventListener('click', async () => {
    try {
      setAuthButtonsBusy('reset');
      const email = document.getElementById('email-input').value.trim();
      if (!email) {
        throw new Error('Enter your email first, then try password reset.');
      }
      const result = await withAuthTimeout(
        () => sendPasswordReset(email),
        'Password reset is taking too long. Please try again.'
      );
      if (result.error) throw result.error;
      showTopNotice('success', 'Reset Email Sent', 'Check your inbox for a password reset link.');
    } catch (error) {
      showTopNotice('error', 'Reset Failed', error.message || 'Could not send the password reset email.');
    } finally {
      setAuthButtonsBusy('');
    }
  });

  document.getElementById('password-toggle-btn')?.addEventListener('click', () => {
    const passwordInput = document.getElementById('password-input');
    const toggleButton = document.getElementById('password-toggle-btn');
    if (!passwordInput || !toggleButton) return;

    const isVisible = passwordInput.type === 'text';
    passwordInput.type = isVisible ? 'password' : 'text';
    toggleButton.classList.toggle('is-visible', !isVisible);
    toggleButton.setAttribute('aria-pressed', String(!isVisible));
    toggleButton.setAttribute('aria-label', isVisible ? 'Show password' : 'Hide password');
  });

  document.getElementById('top-notice-close')?.addEventListener('click', hideTopNotice);

document.getElementById('guest-btn')?.addEventListener('click', () => {
  setAuthButtonsBusy('guest');
  showTopNotice('info', 'Guest Mode', 'Opening your analyzer in this browser...');
  continueAsGuest();
  setTimeout(() => setAuthButtonsBusy(''), 420);
});

document.getElementById('account-trigger')?.addEventListener('click', () => {
  const menu = document.getElementById('account-menu');
  const trigger = document.getElementById('account-trigger');
  if (!menu || !trigger) return;
  const willOpen = !menu.classList.contains('open');
  menu.classList.toggle('open', willOpen);
  trigger.setAttribute('aria-expanded', String(willOpen));
});

  document.getElementById('account-signout-btn')?.addEventListener('click', async () => {
  try {
    await signOut();
    if (window.PathwiseApp?.hydrateProgress) {
      await window.PathwiseApp.hydrateProgress();
    }
    showTopNotice('success', 'Signed Out', 'You are back in guest mode.');
  } catch (error) {
    showTopNotice('error', 'Sign Out Failed', error.message || 'Sign out failed.');
  }
});

document.addEventListener('click', (event) => {
  const menu = document.getElementById('account-menu');
  const trigger = document.getElementById('account-trigger');
  if (!menu || !trigger) return;
  if (!menu.contains(event.target)) {
    menu.classList.remove('open');
    trigger.setAttribute('aria-expanded', 'false');
  }
});

  if (supabase) {
    supabase.auth.onAuthStateChange(async (event, session) => {
      state.session = session ?? null;

      if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session?.user) {
        setResumeMode('account');
        if (event === 'SIGNED_IN') {
          await mergeGuestProgressToDatabase();
        }
        enterAnalyzer(getSavedStep());
      } else if (event === 'SIGNED_OUT') {
        setResumeMode('');
        showIntro();
      }

      renderAuthState(session?.user ?? null, !session?.user && state.guestMode);
      setAuthButtonsBusy('');
      renderSaveStatus('saved', session?.user ? 'Cloud sync active' : (state.guestMode ? 'Guest progress saves in this browser' : 'Ready to save in this browser'));

      if (window.PathwiseApp?.hydrateProgress) {
        await window.PathwiseApp.hydrateProgress();
      }
    });
  }

  try {
    const session = await refreshSession();
    const resumeMode = getResumeMode();
    if (session?.user) {
      state.guestMode = false;
      setResumeMode('account');
      renderAuthState(session.user, false);
      setAuthButtonsBusy('');
      renderSaveStatus('saved', 'Cloud sync active');
      enterAnalyzer(getSavedStep());
    } else if (resumeMode === 'guest') {
      state.guestMode = true;
      renderAuthState(null, true);
      setAuthButtonsBusy('');
      renderSaveStatus('saved', 'Guest progress saves in this browser');
      enterAnalyzer(getSavedStep());
    } else {
      state.guestMode = false;
      renderAuthState(null, false);
      setAuthButtonsBusy('');
      renderSaveStatus('saved', 'Ready to save in this browser');
      showIntro();
    }
  } catch (error) {
    console.error('Failed to restore session', error);
    renderAuthState(null, false);
    setAuthButtonsBusy('');
    renderSaveStatus('error', 'Could not restore session');
    showIntro();
  }

  return {
    supabase,
    config: CONFIG,
    getCurrentUser,
    getSession,
    getProgress,
    saveProgress,
    updateProgress,
    signInWithGoogle,
    signInWithEmail,
    signUpWithEmail,
    sendPasswordReset,
    continueAsGuest,
    signOut,
    enterAnalyzer,
    showIntro,
    mergeGuestProgressToDatabase,
    readGuestProgress,
    clearGuestProgress,
    renderSaveStatus,    showTopNotice,
    hideTopNotice,
    getPendingStep: function () { return state.pendingStep; },
    getBootError: function () { return bootError; }
  };
})();

window.PathwiseApp = {
  hydrateProgress: async function () {
    await loadState();
    renderRoles();
    renderRoleScope();
    renderRequiredSkills();
    renderSkillList();
  },
  enterAnalyzer: function () {
    window.PathwiseSupabaseReady.then((api) => api.enterAnalyzer());
  },
  showIntro: function () {
    window.PathwiseSupabaseReady.then((api) => api.showIntro());
  }
};
/* ═══════════════════════════════════════════
   DATA
═══════════════════════════════════════════ */
const ROLES = {
  "Data Analyst": {
    icon: "📊",
    scope: "Data analysts turn raw business data into clear answers. The role usually focuses on querying datasets, cleaning messy inputs, spotting trends, and presenting insights that help teams make better decisions.",
    outlook: "Strong fit for reporting, operations, product, and business decision support roles.",
    skills: [
      { name: "SQL", weight: 5, category: "Databases" },
      { name: "Python", weight: 4, category: "Programming" },
      { name: "Excel / Google Sheets", weight: 4, category: "Tools" },
      { name: "Data Visualization", weight: 4, category: "Analytics" },
      { name: "Statistics", weight: 5, category: "Analytics" },
      { name: "Tableau / Power BI", weight: 3, category: "Tools" },
      { name: "Data Cleaning", weight: 4, category: "Analytics" },
      { name: "Communication", weight: 3, category: "Soft Skills" },
    ]
  },
  "Frontend Developer": {
    icon: "🎨",
    scope: "Frontend developers build the part of the product users see and interact with. The work centers on interface quality, responsiveness, accessibility, performance, and turning designs into polished web experiences.",
    outlook: "Best suited for product UI, design-heavy web apps, and user-facing engineering teams.",
    skills: [
      { name: "HTML & CSS", weight: 5, category: "Core Web" },
      { name: "JavaScript", weight: 5, category: "Programming" },
      { name: "React", weight: 4, category: "Frameworks" },
      { name: "TypeScript", weight: 4, category: "Programming" },
      { name: "Responsive Design", weight: 4, category: "Core Web" },
      { name: "Git / Version Control", weight: 3, category: "Tools" },
      { name: "Testing (Jest/RTL)", weight: 3, category: "Testing" },
      { name: "Performance Optimization", weight: 3, category: "Core Web" },
      { name: "Accessibility", weight: 3, category: "Core Web" },
    ]
  },
  "Software Developer": {
    icon: "💻",
    scope: "Software developers solve broader engineering problems across features, systems, and internal tools. This path leans on programming fundamentals, clean code, testing, and the ability to build reliable software end to end.",
    outlook: "Good general path for product engineering, application development, and broad SWE roles.",
    skills: [
      { name: "Data Structures & Algorithms", weight: 5, category: "CS Fundamentals" },
      { name: "Object-Oriented Programming", weight: 5, category: "CS Fundamentals" },
      { name: "Python / Java / C++", weight: 5, category: "Programming" },
      { name: "Git / Version Control", weight: 4, category: "Tools" },
      { name: "REST APIs", weight: 4, category: "Architecture" },
      { name: "Unit Testing", weight: 4, category: "Quality" },
      { name: "SQL / Databases", weight: 3, category: "Databases" },
      { name: "CI/CD Pipelines", weight: 3, category: "DevOps" },
      { name: "System Design", weight: 4, category: "Architecture" },
      { name: "Code Review", weight: 3, category: "Collaboration" },
    ]
  },
  "Backend Developer": {
    icon: "⚙️",
    scope: "Backend developers build the services, APIs, and data layers behind applications. The role focuses on server-side logic, security, database design, reliability, and how systems behave under real usage.",
    outlook: "Strong path for API platforms, SaaS products, internal systems, and service-heavy apps.",
    skills: [
      { name: "Python / Node.js / Java", weight: 5, category: "Programming" },
      { name: "REST APIs", weight: 5, category: "Architecture" },
      { name: "SQL Databases", weight: 4, category: "Databases" },
      { name: "Authentication & Security", weight: 4, category: "Security" },
      { name: "Git / Version Control", weight: 3, category: "Tools" },
      { name: "Docker / Containers", weight: 3, category: "DevOps" },
      { name: "NoSQL Databases", weight: 3, category: "Databases" },
      { name: "Cloud Platforms", weight: 3, category: "DevOps" },
      { name: "System Design", weight: 4, category: "Architecture" },
    ]
  },
  "Machine Learning Engineer": {
    icon: "🤖",
    scope: "Machine learning engineers build models that solve prediction, classification, and recommendation problems in production. The role combines math, experimentation, data handling, and deployment discipline.",
    outlook: "Best for data-driven product teams building predictive or intelligent features at scale.",
    skills: [
      { name: "Python", weight: 5, category: "Programming" },
      { name: "Statistics & Probability", weight: 5, category: "Mathematics" },
      { name: "Linear Algebra", weight: 4, category: "Mathematics" },
      { name: "Scikit-learn", weight: 4, category: "ML Libraries" },
      { name: "Deep Learning (PyTorch/TF)", weight: 4, category: "ML Libraries" },
      { name: "Feature Engineering", weight: 4, category: "ML Concepts" },
      { name: "Model Evaluation", weight: 4, category: "ML Concepts" },
      { name: "SQL / Data Processing", weight: 3, category: "Data" },
      { name: "MLOps / Deployment", weight: 3, category: "DevOps" },
    ]
  },
  "QA Engineer": {
    icon: "🧪",
    scope: "QA engineers protect product quality through structured testing, bug discovery, and release confidence. The role spans manual validation, automation, API checks, and clear defect communication.",
    outlook: "Great fit for teams that ship fast and need strong quality gates across web and API releases.",
    skills: [
      { name: "Manual Testing", weight: 5, category: "Testing" },
      { name: "Test Case Writing", weight: 5, category: "Testing" },
      { name: "Selenium / Playwright", weight: 4, category: "Automation" },
      { name: "API Testing (Postman)", weight: 4, category: "Testing" },
      { name: "Bug Reporting & Tracking (Jira)", weight: 4, category: "Tools" },
      { name: "SQL / Database Testing", weight: 3, category: "Databases" },
      { name: "Performance Testing (JMeter)", weight: 3, category: "Automation" },
      { name: "Agile / Scrum", weight: 4, category: "Process" },
      { name: "Test Automation Scripting", weight: 3, category: "Programming" },
    ]
  },
  "Full Stack Developer": {
    icon: "🔀",
    scope: "Full stack developers work across both user interfaces and backend systems. This path is about building complete features, connecting frontend to APIs, and understanding the full request-to-database flow.",
    outlook: "Ideal for startups, product teams, and builders who like owning features from UI to backend.",
    skills: [
      { name: "HTML & CSS", weight: 5, category: "Frontend" },
      { name: "JavaScript", weight: 5, category: "Frontend" },
      { name: "React / Vue / Angular", weight: 4, category: "Frontend" },
      { name: "Node.js / Python / Java", weight: 5, category: "Backend" },
      { name: "REST APIs", weight: 5, category: "Backend" },
      { name: "SQL Databases", weight: 4, category: "Databases" },
      { name: "NoSQL Databases", weight: 3, category: "Databases" },
      { name: "Git / Version Control", weight: 4, category: "Tools" },
      { name: "Docker / Containers", weight: 3, category: "DevOps" },
      { name: "Authentication & Security", weight: 4, category: "Security" },
    ]
  },
  "Game Developer": {
    icon: "🎮",
    scope: "Game developers build interactive real-time experiences with gameplay systems, engines, and performance constraints. The work often mixes programming, math, iteration, and a strong sense of player experience.",
    outlook: "Best suited for gameplay, tools, indie projects, and interactive media teams.",
    skills: [
      { name: "C++ / C#", weight: 5, category: "Programming" },
      { name: "Unity / Unreal Engine", weight: 5, category: "Game Engine" },
      { name: "Game Design Principles", weight: 4, category: "Design" },
      { name: "Linear Algebra & Maths", weight: 4, category: "Mathematics" },
      { name: "Physics Simulation", weight: 3, category: "Mathematics" },
      { name: "3D Modelling Basics (Blender)", weight: 3, category: "Art" },
      { name: "Version Control (Git)", weight: 4, category: "Tools" },
      { name: "Shader Programming (HLSL/GLSL)", weight: 3, category: "Graphics" },
      { name: "Multiplayer / Networking Basics", weight: 3, category: "Architecture" },
      { name: "Performance Optimisation", weight: 4, category: "Engineering" },
    ]
  },
  "DevOps Engineer": {
    icon: "🔧",
    scope: "DevOps engineers improve how software is built, deployed, monitored, and maintained. The role is centered on automation, infrastructure, reliability, and helping engineering teams ship faster with less friction.",
    outlook: "High-value path for platform teams, cloud-heavy products, and reliability-focused engineering orgs.",
    skills: [
      { name: "Linux / Shell Scripting", weight: 5, category: "Systems" },
      { name: "Docker / Kubernetes", weight: 5, category: "Containers" },
      { name: "CI/CD (Jenkins/GitHub Actions)", weight: 5, category: "Automation" },
      { name: "Cloud Platforms (AWS/GCP/Azure)", weight: 4, category: "Cloud" },
      { name: "Infrastructure as Code (Terraform)", weight: 4, category: "Automation" },
      { name: "Monitoring (Prometheus/Grafana)", weight: 4, category: "Observability" },
      { name: "Git / Version Control", weight: 3, category: "Tools" },
      { name: "Networking Basics", weight: 3, category: "Systems" },
      { name: "Security Best Practices", weight: 3, category: "Security" },
    ]
  },
  "Cybersecurity": {
    icon: "🛡️",
    scope: "Cybersecurity roles focus on protecting systems, identities, networks, and data from misuse or attack. The work can span defense, monitoring, vulnerability management, incident response, and security operations.",
    outlook: "Strong path for SOC, blue-team, risk, and infrastructure security roles across many industries.",
    skills: [
      { name: "Network Security", weight: 5, category: "Security" },
      { name: "Threat Detection & Analysis", weight: 4, category: "Security" },
      { name: "SIEM Tools (Splunk/QRadar)", weight: 4, category: "Tools" },
      { name: "Vulnerability Assessment", weight: 4, category: "Security" },
      { name: "Incident Response", weight: 4, category: "Operations" },
      { name: "Linux / Windows Administration", weight: 4, category: "Systems" },
      { name: "Identity & Access Management", weight: 4, category: "Security" },
      { name: "Ethical Hacking Basics", weight: 3, category: "Security" },
      { name: "Python / Scripting", weight: 3, category: "Programming" },
      { name: "Security Tools (Wireshark/Nmap)", weight: 3, category: "Tools" },
      { name: "Cryptography Basics", weight: 3, category: "Security" },
      { name: "Compliance & Frameworks (NIST/ISO)", weight: 3, category: "Governance" },
    ]
  },
  "Cloud Architect": {
    icon: "☁️",
    scope: "Cloud architects design scalable, secure, and cost-aware cloud systems. The role emphasizes high-level system design, platform choices, networking, identity, and infrastructure patterns for long-term growth.",
    outlook: "Best fit for senior cloud design, platform strategy, and enterprise architecture tracks.",
    skills: [
      { name: "AWS / Azure / GCP (Advanced)", weight: 5, category: "Cloud Platforms" },
      { name: "Cloud Architecture Design", weight: 5, category: "Architecture" },
      { name: "Infrastructure as Code (Terraform/CDK)", weight: 5, category: "Automation" },
      { name: "Networking (VPC, DNS, Load Balancing)", weight: 4, category: "Networking" },
      { name: "Security & IAM", weight: 4, category: "Security" },
      { name: "Kubernetes / Container Orchestration", weight: 4, category: "Containers" },
      { name: "Cost Optimisation", weight: 4, category: "FinOps" },
      { name: "Serverless Architecture", weight: 3, category: "Architecture" },
      { name: "DevOps / CI/CD Integration", weight: 3, category: "Automation" },
    ]
  },
  "Gen AI Developer": {
    icon: "🧠",
    scope: "Gen AI developers build applications powered by large language models and related tooling. The role blends prompting, model APIs, retrieval systems, backend integration, evaluation, and product thinking around AI behavior.",
    outlook: "Great fit for AI product teams, internal copilots, knowledge tools, and AI-powered workflows.",
    skills: [
      { name: "Python", weight: 5, category: "Programming" },
      { name: "LLM APIs (OpenAI / Anthropic / Gemini)", weight: 5, category: "AI Tools" },
      { name: "Prompt Engineering", weight: 5, category: "AI Concepts" },
      { name: "RAG (Retrieval-Augmented Generation)", weight: 4, category: "AI Concepts" },
      { name: "LangChain / LlamaIndex", weight: 4, category: "Frameworks" },
      { name: "Vector Databases (Pinecone / Chroma)", weight: 4, category: "Databases" },
      { name: "Fine-tuning & Model Adaptation", weight: 3, category: "AI Concepts" },
      { name: "REST APIs / FastAPI", weight: 4, category: "Backend" },
      { name: "Git / Version Control", weight: 3, category: "Tools" },
      { name: "Evaluation & Testing of LLMs", weight: 4, category: "AI Concepts" },
    ]
  },
};

/* All unique skill names across all roles — for the dropdown */
const ALL_SKILL_SUGGESTIONS = [...new Set(
  Object.values(ROLES).flatMap(r => r.skills.map(s => s.name))
)].sort();

const SCORE_COLORS = [
  { max: 30,  color: "#f06060", label: "Just Starting Out" },
  { max: 55,  color: "#fb923c", label: "Building Foundations" },
  { max: 75,  color: "#f5c842", label: "Developing Skills" },
  { max: 90,  color: "#4ecca3", label: "Strong Candidate" },
  { max: 101, color: "#5b8def", label: "Job-Ready Expert" },
];

// 3-level system: 1=Beginner, 2=Intermediate, 3=Expert
const LEVEL_LABELS = { 1: "Beginner", 2: "Intermediate", 3: "Expert" };
const LEVEL_CSS    = { 1: "lvl-beginner", 2: "lvl-intermediate", 3: "lvl-expert" };

/* ═══ STATE ═══ */
let selectedRole = "Data Analyst";
let skills = [];
let editId = null;
let lastResults = null;
let highlightedIndex = -1;

/* ═══ HELPERS ═══ */
function getScoreInfo(s) { return SCORE_COLORS.find(x => s < x.max) || SCORE_COLORS[SCORE_COLORS.length - 1]; }

/* ═══ PAGE SWITCH ═══ */
/* ═══ 3-STEP NAVIGATION ═══ */
// Steps: 'setup' → 'analysis' → 'action'
// Gating: analysis only unlocked after analyze(), action only after analysis viewed

const STEP_ORDER = ['setup', 'analysis', 'action'];

function isValidStepName(name) {
  return STEP_ORDER.includes(name);
}

function getSavedStep() {
  try {
    const saved = localStorage.getItem('pw_last_step');
    return isValidStepName(saved) ? saved : 'setup';
  } catch (error) {
    return 'setup';
  }
}

function persistStep(step) {
  if (!isValidStepName(step)) return;
  try {
    localStorage.setItem('pw_last_step', step);
  } catch (error) {}
}

function renderHeaderPage(name) {
  const context = document.querySelector('.header-context');
  const brand = document.getElementById('header-brand-mini');
  const pageCopy = document.getElementById('header-page-copy');
  const el = document.getElementById('header-page-title');
  if (context) context.style.display = name === 'setup' ? '' : 'none';
  if (brand) brand.style.display = name === 'setup' ? 'flex' : 'none';
  if (pageCopy) pageCopy.style.display = name === 'setup' ? 'none' : 'flex';
  if (!el) return;
  const labels = {
    setup: 'Setup',
    analysis: 'Analysis',
    action: 'Action Plan'
  };
  el.textContent = labels[name] || 'Setup';
}

function goToStep(name) {
  if (name === 'intro') {
    if (window.PathwiseApp?.showIntro) window.PathwiseApp.showIntro();
    return;
  }

  // Gate: analysis and action require completed results
  if ((name === 'analysis' || name === 'action') && !lastResults) {
    // Visual shake on disabled step button
    const btn = document.getElementById('step-' + name);
    if (btn) { btn.style.animation = 'none'; void btn.offsetWidth; btn.style.animation = 'stepShake 0.3s ease'; }
    return;
  }

  closeDropdown();

  // Fade out current page, then swap
  const current = document.querySelector('.page.active');
  const next    = document.getElementById('page-' + name);
  if (!next) return;
  persistStep(name);
  renderHeaderPage(name);

  if (current && current !== next) {
    current.style.opacity = '0';
    current.style.transform = 'translateY(-10px) scale(0.995)';
    current.style.transition = 'opacity 0.26s cubic-bezier(0.22,1,0.36,1), transform 0.26s cubic-bezier(0.22,1,0.36,1)';
    setTimeout(() => {
      current.classList.remove('active');
      current.style.opacity = '';
      current.style.transform = '';
      current.style.transition = '';
      next.classList.add('active');
      window.scrollTo({ top: 0, behavior: 'instant' });
      _afterStepChange(name);
    }, 180);
  } else {
    if (current) current.classList.remove('active');
    next.classList.add('active');
    window.scrollTo({ top: 0, behavior: 'instant' });
    _afterStepChange(name);
  }

  // Update stepper state immediately
  const currentIdx = STEP_ORDER.indexOf(name);
  STEP_ORDER.forEach((step, idx) => {
    const btn = document.getElementById('step-' + step);
    if (!btn) return;
    btn.classList.remove('active', 'done');
    if (idx < currentIdx)  btn.classList.add('done');
    if (idx === currentIdx) btn.classList.add('active');
  });
  document.getElementById('step-analysis').disabled = !lastResults;
  document.getElementById('step-action').disabled   = !lastResults;
}

function _afterStepChange(name) {
  if (name === 'analysis' && lastResults) {
    animateResults(lastResults.score);
    setTimeout(triggerRevealSequence, 60);
  }
  if (name === 'action' && lastResults) {
    setTimeout(triggerRevealSequence, 60);
  }
}

// Keep switchPage as alias for backward compat
function switchPage(name) {
  const map = { setup: 'setup', results: 'analysis' };
  goToStep(map[name] || name);
}

/* ═══ COMBOBOX LOGIC ═══ */
const skillInput = document.getElementById('skill-input');
const dropdown = document.getElementById('combo-dropdown');

function getFilteredSuggestions(query) {
  const q = query.toLowerCase().trim();
  const roleSkillNames = (ROLES[selectedRole]?.skills || [])
    .slice().sort((a, b) => b.weight - a.weight)
    .map(s => s.name);
  const roleSet = new Set(roleSkillNames);
  const otherSkills = ALL_SKILL_SUGGESTIONS.filter(s => !roleSet.has(s));
  if (!q) return { role: roleSkillNames, other: otherSkills };
  const matchedRole  = roleSkillNames.filter(s => s.toLowerCase().includes(q));
  const matchedOther = otherSkills.filter(s => s.toLowerCase().includes(q));
  return { role: matchedRole, other: matchedOther };
}

function renderDropdown(data) {
  highlightedIndex = -1;
  const roleItems  = data.role  || [];
  const otherItems = data.other || [];
  const total = roleItems.length + otherItems.length;
  if (total === 0) {
    dropdown.innerHTML = '<div class="combo-no-match">No match — your custom skill will be added</div>';
  } else {
    let html = '', idx = 0;
    if (roleItems.length > 0) {
      html += '<div class="combo-group-label">For ' + selectedRole + '</div>';
      html += roleItems.map(item =>
        '<div class="combo-option combo-role-skill" data-value="' + item + '" data-index="' + (idx++) + '">' + item + '</div>'
      ).join('');
    }
    if (otherItems.length > 0) {
      if (roleItems.length > 0) html += '<div class="combo-group-divider"></div>';
      html += '<div class="combo-group-label">Other skills</div>';
      html += otherItems.map(item =>
        '<div class="combo-option" data-value="' + item + '" data-index="' + (idx++) + '">' + item + '</div>'
      ).join('');
    }
    dropdown.innerHTML = html;
    dropdown.querySelectorAll('.combo-option').forEach(opt => {
      opt.addEventListener('mousedown', e => {
        e.preventDefault();
        skillInput.value = opt.dataset.value;
        closeDropdown();
      });
    });
  }
  dropdown.classList.add('open');
}

function closeDropdown() {
  dropdown.classList.remove('open');
  highlightedIndex = -1;
}

function updateHighlight() {
  const opts = dropdown.querySelectorAll('.combo-option');
  opts.forEach((o, i) => o.classList.toggle('highlighted', i === highlightedIndex));
  if (highlightedIndex >= 0 && opts[highlightedIndex]) {
    opts[highlightedIndex].scrollIntoView({ block: 'nearest' });
  }
}

// Track whether we're in the middle of an add-btn interaction
let _addingSkill = false;

skillInput.addEventListener('input', () => {
  const items = getFilteredSuggestions(skillInput.value);
  renderDropdown(items);
});

skillInput.addEventListener('focus', () => {
  if (_addingSkill) return; // don't double-open during add
  const items = getFilteredSuggestions(skillInput.value);
  renderDropdown(items);
});

skillInput.addEventListener('blur', () => {
  // Delay close so mousedown on dropdown options fires first
  setTimeout(() => {
    if (!_addingSkill) closeDropdown();
  }, 150);
});

skillInput.addEventListener('keydown', e => {
  const opts = dropdown.querySelectorAll('.combo-option');
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    highlightedIndex = Math.min(highlightedIndex + 1, opts.length - 1);
    updateHighlight();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    highlightedIndex = Math.max(highlightedIndex - 1, 0);
    updateHighlight();
  } else if (e.key === 'Enter') {
    if (highlightedIndex >= 0 && opts[highlightedIndex]) {
      skillInput.value = opts[highlightedIndex].dataset.value;
      closeDropdown();
    } else {
      closeDropdown();
      addSkill();
    }
  } else if (e.key === 'Escape') {
    closeDropdown();
  }
});

// Close only when clicking truly outside both the combo-wrap AND add-btn
document.addEventListener('click', e => {
  const wrap = document.getElementById('combo-wrap');
  const addB = document.getElementById('add-btn');
  if (!wrap.contains(e.target) && e.target !== addB) closeDropdown();
});

/* ═══ ROLES ═══ */
function renderRoles() {
  const grid = document.getElementById('role-grid');
  grid.innerHTML = '';
  Object.entries(ROLES).forEach(([name, data]) => {
    const btn = document.createElement('button');
    btn.className = 'role-btn' + (selectedRole === name ? ' active' : '');
    btn.innerHTML = '<div class="role-name">' + name + '</div><div class="role-count">' + data.skills.length + ' skills</div>';
    btn.onclick = () => { selectedRole = name; renderRoles(); renderRoleScope(); renderRequiredSkills(); resetResults(); saveState(); };
    grid.appendChild(btn);
  });
}

function renderRoleScope() {
  const title = document.getElementById('role-scope-title');
  const copy = document.getElementById('role-scope-copy');
  const outlook = document.getElementById('role-scope-outlook');
  const role = ROLES[selectedRole];
  if (!title || !copy || !outlook || !role) return;
  title.textContent = selectedRole;
  copy.textContent = role.scope || '';
  outlook.textContent = role.outlook || '';
}

function renderRequiredSkills() {
  const c = document.getElementById('required-skills');
  c.innerHTML = '';
  ROLES[selectedRole].skills.slice().sort((a,b) => b.weight - a.weight).forEach(s => {
    const color = s.weight >= 4 ? '#f06060' : s.weight === 3 ? '#f5c842' : '#4ecca3';
    const t = document.createElement('span');
    t.className = 'tag';
    t.innerHTML = '<span class="dot" style="background:' + color + '"></span>' + s.name;
    c.appendChild(t);
  });
}

/* ═══ SKILLS ═══ */
function renderSkillList() {
  const c = document.getElementById('skill-list-container');
  document.getElementById('skill-counter').textContent = skills.length + ' skill' + (skills.length !== 1 ? 's' : '') + ' added';
  document.getElementById('analyze-btn').disabled = skills.length === 0;
  document.getElementById('clear-btn').style.display = skills.length > 0 ? '' : 'none';
  document.getElementById('skill-card-title').innerHTML = editId !== null ? 'Edit Skill' : 'Your Skills';

  if (skills.length === 0) {
    c.innerHTML = `<div class="empty-state"><div>Add your skills above to get started</div></div>`;
    return;
  }
  const list = document.createElement('div');
  list.className = 'skill-list';
  skills.forEach(s => {
    const item = document.createElement('div');
    item.className = 'skill-item';
    item.style.animationDelay = (skills.indexOf(s) * 40) + 'ms';
    const lvlClass = LEVEL_CSS[s.level] || '';
    item.innerHTML = `
      <span class="skill-name-text">${s.name}</span>
      <span class="skill-level-badge ${lvlClass}">${LEVEL_LABELS[s.level]}</span>
      <button class="btn btn-sm btn-ghost eb" data-id="${s.id}" title="Edit">✎</button>
      <button class="btn btn-sm btn-ghost rb" data-id="${s.id}">✕</button>`;
    list.appendChild(item);
  });
  c.innerHTML = '';
  c.appendChild(list);
  c.querySelectorAll('.eb').forEach(b => b.onclick = () => startEdit(+b.dataset.id));
  c.querySelectorAll('.rb').forEach(b => b.onclick = () => removeSkill(+b.dataset.id));
}

function addSkill() {
  const name = skillInput.value.trim();
  if (!name) return;
  const level = parseInt(document.getElementById('skill-level').value);
  if (editId !== null) {
    skills = skills.map(s => s.id === editId ? { ...s, name, level } : s);
    editId = null;
    document.getElementById('add-btn').textContent = '+ Add Skill';
  } else {
    if (skills.find(s => s.name.toLowerCase() === name.toLowerCase())) {
      showToast('⚠ "' + name + '" is already in your skills list.');
      skillInput.select();
      renderDropdown(getFilteredSuggestions(skillInput.value));
      return;
    }
    skills.push({ id: Date.now(), name, level });
  }
  skillInput.value = '';
  document.getElementById('skill-level').value = '1';
  if (window._resetLevelDropdown) window._resetLevelDropdown();
  resetResults();
  saveState();
  renderSkillList();
  // Flag so blur handler doesn't close dropdown while we re-focus
  _addingSkill = true;
  skillInput.focus();
  renderDropdown(getFilteredSuggestions(''));
  // Small delay then clear flag
  setTimeout(() => { _addingSkill = false; }, 200);
}

function clearAllSkills() {
  if (skills.length === 0) return;
  skills = [];
  editId = null;
  document.getElementById('add-btn').textContent = '+ Add Skill';
  resetResults();
  saveState();
  renderSkillList();
}

function removeSkill(id) { skills = skills.filter(s => s.id !== id); resetResults(); saveState(); renderSkillList(); }

function startEdit(id) {
  const s = skills.find(x => x.id === id);
  if (!s) return;
  editId = id;
  skillInput.value = s.name;
  document.getElementById('skill-level').value = s.level;
  document.getElementById('add-btn').textContent = 'Save Changes';
  skillInput.focus();
  renderSkillList();
}

function resetResults() {
  lastResults = null;
  document.getElementById('step-analysis').disabled = true;
  document.getElementById('step-action').disabled   = true;
  document.getElementById('score-badge').style.display = 'none';
  // Clear persisted results — user changed their inputs
  try { localStorage.removeItem('pw_results'); } catch(e) {}
}

/* ═══ LOCALSTORAGE PERSIST ═══ */
function saveState() {
  try {
    localStorage.setItem('pw_skills', JSON.stringify(skills));
    localStorage.setItem('pw_role', selectedRole);
    // Do NOT auto-save results — only save explicit user inputs
  } catch(e) {}
}

function saveResults(results) {
  // Only called explicitly after analyze() completes
  try {
    localStorage.setItem('pw_results', JSON.stringify(results));
  } catch(e) {}
}

function loadState() {
  try {
    const s = localStorage.getItem('pw_skills');
    const r = localStorage.getItem('pw_role');
    const res = localStorage.getItem('pw_results');
    if (s) skills = JSON.parse(s);
    if (r && ROLES[r]) selectedRole = r;
    if (res) {
      lastResults = JSON.parse(res);
      // Unlock steps if we have saved results
      setTimeout(() => {
        if (lastResults) {
          document.getElementById('step-analysis').disabled = false;
          document.getElementById('step-action').disabled   = false;
          const badge = document.getElementById('score-badge');
          badge.textContent = lastResults.score + '%';
          badge.style.display = '';
          // Re-render analysis page with saved data
          buildResultsHTML(lastResults);
          const cta = document.getElementById('action-cta');
          if (cta) cta.style.display = '';
        }
      }, 0);
    }
  } catch(e) {}
}

function computeResults() {
  const role = ROLES[selectedRole];
  const LEVEL_MULT  = { 1: 0.30, 2: 0.65, 3: 1.00 };
  const TIER_FACTOR = (w) => w >= 4 ? 1.0 : w === 3 ? 1.0 : 0.6;

  let totalPossible = 0;
  let matchedWeight = 0;
  const matched = [];
  const missing = [];

  role.skills.forEach(rs => {
    const tierF = TIER_FACTOR(rs.weight);
    totalPossible += rs.weight * tierF;

    const us = skills.find(u =>
      u.name.toLowerCase().includes(rs.name.toLowerCase()) ||
      rs.name.toLowerCase().includes(u.name.toLowerCase())
    );

    if (us) {
      const lm = LEVEL_MULT[us.level] || 0.30;
      const contribution = rs.weight * lm * tierF;
      matchedWeight += contribution;
      matched.push({ ...rs, userLevel: us.level, contribution });
    } else {
      missing.push(rs);
    }
  });

  const criticalSkills = role.skills.filter(s => s.weight >= 4);
  const missingCritical = missing.filter(s => s.weight >= 4);
  const allCriticalOwned = missingCritical.length === 0 && criticalSkills.length > 0;

  const rawScore = (matchedWeight / totalPossible) * 100;
  const criticalPenalty = missingCritical.length * 3;
  const criticalBonus = allCriticalOwned ? 8 : 0;
  const score = Math.min(100, Math.max(0, Math.round(rawScore - criticalPenalty + criticalBonus)));

  const cats = {};
  role.skills.forEach(rs => {
    if (!cats[rs.category]) cats[rs.category] = { total: 0, achieved: 0 };
    cats[rs.category].total += rs.weight;
  });
  matched.forEach(rs => { cats[rs.category].achieved += rs.contribution; });

  const catResults = Object.entries(cats).map(([name, { total, achieved }]) => ({
    name, score: Math.min(100, Math.round((achieved / total) * 100))
  })).sort((a, b) => a.score - b.score);

  const priorities = [...missing].sort((a, b) => b.weight - a.weight).slice(0, 3);
  return { score, missing, matched, catResults, priorities };
}

function getProgressPayload(scoreOverride = null) {
  return {
    selected_role: selectedRole,
    skills: skills,
    score: scoreOverride !== null ? scoreOverride : (lastResults ? lastResults.score : null)
  };
}

async function resetResults() {
  lastResults = null;
  document.getElementById('step-analysis').disabled = true;
  document.getElementById('step-action').disabled   = true;
  document.getElementById('score-badge').style.display = 'none';
}

async function saveState() {
  try {
    const api = await window.PathwiseSupabaseReady;
    api.renderSaveStatus('saving', 'Saving progress...');
    await api.saveProgress(getProgressPayload());
    api.renderSaveStatus('saved', api.getSession()?.user ? 'Progress synced to your account' : 'Progress saved in this browser');
  } catch (e) {
    console.error('saveState failed', e);
    const api = await window.PathwiseSupabaseReady;
    api.renderSaveStatus('error', 'Save failed. Try again.');
  }
}

async function saveResults(results) {
  try {
    const api = await window.PathwiseSupabaseReady;
    api.renderSaveStatus('saving', 'Saving analysis...');
    await api.saveProgress(getProgressPayload(results.score));
    api.renderSaveStatus('saved', api.getSession()?.user ? 'Analysis saved to your account' : 'Analysis saved in this browser');
  } catch (e) {
    console.error('saveResults failed', e);
    const api = await window.PathwiseSupabaseReady;
    api.renderSaveStatus('error', 'Could not save analysis');
  }
}

async function loadState() {
  try {
    const api = await window.PathwiseSupabaseReady;
    api.renderSaveStatus('saving', 'Loading progress...');
    const progress = await api.getProgress();
    if (!progress) {
      api.renderSaveStatus('saved', api.getSession()?.user ? 'Cloud sync active' : 'Ready to save in this browser');
      return;
    }

    if (progress.selected_role && ROLES[progress.selected_role]) selectedRole = progress.selected_role;
    if (Array.isArray(progress.skills)) skills = progress.skills;
    api.renderSaveStatus('saved', api.getSession()?.user ? 'Progress restored from your account' : 'Progress restored from this browser');

    if (skills.length > 0) {
      lastResults = computeResults();
      setTimeout(() => {
        if (!lastResults) return;
        document.getElementById('step-analysis').disabled = false;
        document.getElementById('step-action').disabled   = false;
        const badge = document.getElementById('score-badge');
        badge.textContent = lastResults.score + '%';
        badge.style.display = '';
        buildResultsHTML(lastResults);
        const cta = document.getElementById('action-cta');
        if (cta) cta.style.display = '';
        const resumeStep = api.getPendingStep ? api.getPendingStep() : getSavedStep();
        if (resumeStep === 'analysis' || resumeStep === 'action') {
          goToStep(resumeStep);
        }
      }, 0);
    }
  } catch (e) {
    console.error('loadState failed', e);
    const api = await window.PathwiseSupabaseReady;
    api.renderSaveStatus('error', 'Could not load saved progress');
  }
}

/* ═══ ANALYZE ═══ */
async function analyze() {
  // Show loader
  const overlay = document.getElementById('loading-overlay');
  const bar     = document.getElementById('loader-bar');
  const pctEl   = document.getElementById('loader-pct');
  const logEl   = document.getElementById('terminal-log');

  // Terminal log lines — [delay_ms, percent, type, prompt, cmd, text]
  const termLines = [
    [0,    0,   'boot',   '>',  'init',            'Booting Pathwise Analyzer...'],
    [120,  8,   'info',   '$',  'load-profile',    `Loading user profile [${skills.length} skills detected]`],
    [260,  18,  'info',   '$',  'fetch-role-data', `Fetching role schema → ${selectedRole}`],
    [420,  28,  'run',    '>>>', 'match-skills',   'Running skill-match algorithm...'],
    [600,  40,  'data',   '  ', '',                'Comparing against 47 industry benchmarks'],
    [750,  52,  'run',    '>>>', 'calc-weights',   'Calculating weighted tier scores...'],
    [900,  62,  'data',   '  ', '',                'Critical: weight×1.0  Supporting: weight×1.0  Optional: weight×0.6'],
    [1050, 72,  'run',    '>>>', 'gap-analysis',   'Running gap analysis + penalty model...'],
    [1200, 82,  'run',    '>>>', 'gen-insights',   'Generating insights + learning roadmap...'],
    [1340, 91,  'run',    '>>>', 'build-report',   'Compiling readiness report...'],
    [1480, 98,  'done',   '✓',  '',                'Analysis complete. Loading results...'],
  ];

  // Clear log
  logEl.innerHTML = '';
  overlay.classList.add('visible');
  document.getElementById('analyze-btn').disabled = true;

  // Render all line skeletons immediately (hidden)
  termLines.forEach((_, i) => {
    const div = document.createElement('div');
    div.className = 't-line';
    div.id = 'tl-' + i;
    logEl.appendChild(div);
  });

  // Animate lines in sequence
  function setBarPct(pct) {
    bar.style.width = pct + '%';
    if (pctEl) pctEl.textContent = pct + '%';
  }

  const typeColors = {
    boot: ['t-accent',  't-cmd',    't-dim'],
    info: ['t-accent',  't-cmd',    't-text'],
    run:  ['t-prompt',  't-cmd',    't-text'],
    data: ['t-dim',     't-dim',    't-dim'],
    done: ['t-done',    't-done',   't-done'],
  };

  termLines.forEach(([delay, pct, type, prompt, cmd, text], i) => {
    setTimeout(() => {
      setBarPct(pct);
      const div = document.getElementById('tl-' + i);
      if (!div) return;
      const [pc, cc, tc] = typeColors[type] || ['t-text','t-cmd','t-text'];
      const cursor = i === termLines.length - 1 ? '<span class="terminal-cursor"></span>' : '';
      div.innerHTML = `
        <span class="${pc}">${prompt}</span>
        ${cmd ? `<span class="${cc}">${cmd}</span>` : ''}
        <span class="${tc}">${text}${cursor}</span>
      `;
      div.classList.add('show');
      // Scroll log into view
      logEl.scrollTop = logEl.scrollHeight;
    }, delay);
  });

  // Pause so the user can read it — actual compute happens after
  await new Promise(r => setTimeout(r, 1600));

  // Do the actual computation
  const role = ROLES[selectedRole];
  // ── NEW SCORING SYSTEM ──────────────────────────────────────
  // Tiers:  Critical w≥4  |  Supporting w=3  |  Optional w≤2
  //
  // 1. Level multipliers with diminishing returns for beginner spam:
  //    Beginner: 0.30  |  Intermediate: 0.65  |  Expert: 1.00
  //    (Beginner is lower than 1/3 to penalise padding with beginner skills)
  //
  // 2. Critical skill penalty: each MISSING critical skill deducts
  //    an extra 3 pts from the final score (beyond its normal absence).
  //
  // 3. Critical skill bonus: if ALL critical skills are owned (any level),
  //    add +8 pts to final score.
  //
  // 4. Supporting skills: contribute at face value × level multiplier.
  //
  // 5. Optional skills: contribute at 60% of face value × level multiplier
  //    (diminishing returns — they shouldn't inflate score much).
  //
  // Formula: rawScore = sum(weight × levelMult × tierFactor) / totalPossible × 100
  //          finalScore = rawScore − criticalPenalty + criticalBonus
  // ────────────────────────────────────────────────────────────
  const LEVEL_MULT  = { 1: 0.30, 2: 0.65, 3: 1.00 };
  const TIER_FACTOR = (w) => w >= 4 ? 1.0 : w === 3 ? 1.0 : 0.6;

  let totalPossible = 0;
  let matchedWeight = 0;
  const matched = [], missing = [];

  role.skills.forEach(rs => {
    const tierF = TIER_FACTOR(rs.weight);
    totalPossible += rs.weight * tierF;

    const us = skills.find(u =>
      u.name.toLowerCase().includes(rs.name.toLowerCase()) ||
      rs.name.toLowerCase().includes(u.name.toLowerCase())
    );
    if (us) {
      const lm = LEVEL_MULT[us.level] || 0.30;
      const contribution = rs.weight * lm * tierF;
      matchedWeight += contribution;
      matched.push({ ...rs, userLevel: us.level, contribution });
    } else {
      missing.push(rs);
    }
  });

  const criticalSkills = role.skills.filter(s => s.weight >= 4);
  const missingCritical = missing.filter(s => s.weight >= 4);
  const allCriticalOwned = missingCritical.length === 0 && criticalSkills.length > 0;

  let rawScore = (matchedWeight / totalPossible) * 100;
  const criticalPenalty = missingCritical.length * 3;
  const criticalBonus   = allCriticalOwned ? 8 : 0;

  const score = Math.min(100, Math.max(0, Math.round(rawScore - criticalPenalty + criticalBonus)));
  const cats = {};
  role.skills.forEach(rs => {
    if (!cats[rs.category]) cats[rs.category] = { total: 0, achieved: 0 };
    cats[rs.category].total += rs.weight;
  });
  matched.forEach(rs => { cats[rs.category].achieved += rs.contribution; });
  const catResults = Object.entries(cats).map(([name, { total, achieved }]) => ({
    name, score: Math.min(100, Math.round((achieved / total) * 100))
  })).sort((a, b) => a.score - b.score);

  const priorities = [...missing].sort((a, b) => b.weight - a.weight).slice(0, 3);
  lastResults = { score, missing, matched, catResults, priorities };

  // Finish bar
  setBarPct(100);
  await new Promise(r => setTimeout(r, 300));
  overlay.classList.remove('visible');
  document.getElementById('analyze-btn').disabled = skills.length === 0;

  buildResultsHTML({ score, missing, matched, catResults, priorities });

  // Unlock steps
  document.getElementById('step-analysis').disabled = false;
  document.getElementById('step-action').disabled   = false;
  const badge = document.getElementById('score-badge');
  badge.textContent = score + '%';
  badge.style.display = '';

  // Show action CTA on analysis page
  const cta = document.getElementById('action-cta');
  if (cta) {
    cta.style.visibility = '';
    cta.style.maxHeight = '';
    cta.style.overflow = '';
    cta.style.margin = '';
    requestAnimationFrame(() => {
      cta.classList.remove('visible');
      requestAnimationFrame(() => { cta.classList.add('visible'); });
    });
  }

  // Persist results explicitly (only after user-triggered analysis)
  saveResults({ score, missing, matched, catResults, priorities });

  goToStep('analysis');
  setTimeout(triggerRevealSequence, 200);

  // Reset bar + log for next time
  setTimeout(() => {
    bar.style.width = '0%';
    if (pctEl) pctEl.textContent = '0%';
    logEl.innerHTML = '';
  }, 700);
}

function buildResultsHTML({ score, missing, matched, catResults, priorities }) {
  const si = getScoreInfo(score);
  const circ = 2 * Math.PI * 60;

  document.getElementById('results-role-badge').textContent = selectedRole;

  const arc = document.getElementById('score-arc');
  arc.setAttribute('stroke', si.color);
  arc.setAttribute('stroke-dasharray', circ);
  arc.setAttribute('stroke-dashoffset', circ);
  document.getElementById('score-num').style.color = si.color;
  document.getElementById('score-num').textContent = '0';
  document.getElementById('score-label').style.color = si.color;
  document.getElementById('score-label').textContent = si.label;

  const desc = score < 40 ? "You're at the beginning of your journey. Focus on building core fundamentals first."
    : score < 65 ? "Good progress! You have a solid base but there are key skills to develop further."
    : score < 85 ? "You're a strong candidate! Polish your remaining skills to stand out."
    : "Excellent! You're highly prepared for this role. Keep growing and staying current.";
  document.getElementById('score-desc').textContent = desc;
  document.getElementById('progress-fill').style.cssText = `width:0%;background:linear-gradient(90deg,${si.color},${si.color}99)`;

  document.getElementById('stat-matched').textContent = matched.length + '/' + ROLES[selectedRole].skills.length;
  document.getElementById('stat-missing').textContent = missing.length;
  document.getElementById('stat-score').textContent = score + '%';
  document.getElementById('stat-score').style.color = si.color;

  document.getElementById('cat-grid').innerHTML = catResults.map(c => {
    const col = c.score < 40 ? '#f06060' : c.score < 70 ? '#f5c842' : '#4ecca3';
    return `<div class="cat-item"><div class="cat-header"><span class="cat-name">${c.name}</span><span class="cat-pct">${c.score}%</span></div><div class="cat-bar-wrap"><div class="cat-bar-fill" data-target="${c.score}" style="background:${col}"></div></div></div>`;
  }).join('');

  document.getElementById('missing-list').innerHTML = missing.length === 0
    ? `<div class="good-msg">All required skills covered.</div>`
    : missing.map(s => {
        const tierLabel = s.weight >= 4 ? 'Critical' : s.weight === 3 ? 'Supporting' : 'Optional';
        const tierClass = s.weight >= 4 ? 'is-critical' : s.weight === 3 ? 'is-supporting' : 'is-optional';
        return `<div class="missing-item"><span class="missing-item-name">${s.name}</span><span class="weight-badge ${tierClass}">${tierLabel}</span></div>`;
      }).join('');

  buildInsights(selectedRole, score);
  renderPortfolioProjects(selectedRole, missing, matched);
  buildWhySection(matched, missing, selectedRole);
  buildRoadmap(matched, missing, selectedRole);
  buildSimulator(matched, missing, selectedRole, score);
  buildAdvisor(selectedRole, score, missing, matched);
  buildLearnResources(missing);

  const pc = ['#f5c842','#fb923c','#a78bfa'];
  document.getElementById('priority-list').innerHTML = priorities.length === 0
    ? `<div class="good-msg">No gaps to fill.</div>`
    : priorities.map((s, i) => `<div class="priority-item" style="animation-delay:${i*40}ms"><div class="priority-num" style="background:${pc[i]}20;color:${pc[i]};border-radius:6px;">#${i+1}</div><div class="priority-info"><div class="priority-name">${s.name}</div><div class="priority-cat">${s.category}</div></div><span class="skill-level-badge" style="font-size:10px;padding:2px 8px;">wt ${s.weight}</span></div>`).join('');

  renderActionSummary({ score, missing, matched, catResults, priorities });
  kickResultSpotlight();
}

function renderActionSummary({ score, missing, matched, catResults, priorities }) {
  const strongestCategory = catResults.length
    ? [...catResults].sort((a, b) => b.score - a.score)[0]
    : null;
  const weakestCategory = catResults.length
    ? [...catResults].sort((a, b) => a.score - b.score)[0]
    : null;
  const nextSkill = priorities.length ? priorities[0] : null;

  document.getElementById('action-summary-score').textContent = `${score}%`;
  document.getElementById('action-summary-role').textContent = `${selectedRole} readiness snapshot`;
  document.getElementById('action-summary-strength').textContent = strongestCategory ? strongestCategory.name : 'Still building';
  document.getElementById('action-summary-strength-note').textContent = strongestCategory
    ? `${strongestCategory.score}% coverage in your best category.`
    : 'Add skills to surface your strongest area.';
  document.getElementById('action-summary-gap').textContent = nextSkill ? nextSkill.name : (weakestCategory ? weakestCategory.name : 'No major gap');
  document.getElementById('action-summary-gap-note').textContent = nextSkill
    ? `${nextSkill.weight >= 4 ? 'Critical' : nextSkill.weight === 3 ? 'Supporting' : 'Optional'} priority for this role.`
    : (missing.length ? `${missing.length} skills still need attention.` : 'You have covered the key skills for this role.');
  document.getElementById('action-summary-next').textContent = nextSkill ? `Learn ${nextSkill.name}` : 'Build projects';
  document.getElementById('action-summary-next-note').textContent = nextSkill
    ? `Start with ${nextSkill.name}, then move into ${priorities[1] ? priorities[1].name : 'portfolio practice'}.`
    : `Turn your current skills into projects for ${selectedRole}.`;
}

function animateResults(score) {
  const circ  = 2 * Math.PI * 60;
  const arc   = document.getElementById('score-arc');
  const numEl = document.getElementById('score-num');
  const pf    = document.getElementById('progress-fill');
  const si    = getScoreInfo(score);

  // Reset
  arc.setAttribute('stroke-dashoffset', circ);
  numEl.textContent = '0';
  pf.style.width = '0%';

  // No glow animation on circle — prevents jitter

  // Animate number, arc, and bar in sync — elastic easing
  const duration = 1400;
  let start = null;
  function easeOutExpo(t) { return t === 1 ? 1 : 1 - Math.pow(2, -10 * t); }

  function step(ts) {
    if (!start) start = ts;
    const p   = Math.min((ts - start) / duration, 1);
    const e   = easeOutExpo(p);
    const cur = Math.round(score * e);
    numEl.textContent = cur;
    arc.setAttribute('stroke-dashoffset', circ - (cur / 100) * circ);
    pf.style.width = cur + '%';
    if (p < 1) {
      requestAnimationFrame(step);
    } else {

    }
  }
  requestAnimationFrame(step);



  // Category bars staggered
  setTimeout(() => {
    document.querySelectorAll('.cat-bar-fill').forEach((b, i) => {
      setTimeout(() => { b.style.width = b.dataset.target + '%'; }, i * 60);
    });
  }, duration * 0.7);
}

function kickResultSpotlight() {
  const targets = document.querySelectorAll('#page-analysis .score-hero, #page-analysis .stat-box, #page-analysis .section-card, #page-analysis .advisor-wrap, #page-action .simulator-wrap, #page-action .section-card, #page-action #portfolio-projects-block');
  targets.forEach((element, index) => {
    element.classList.remove('result-spotlight');
    element.style.animationDelay = `${Math.min(index * 45, 220)}ms`;
    requestAnimationFrame(() => {
      element.classList.add('result-spotlight');
    });
  });
}

/* ═══ CUSTOM LEVEL DROPDOWN ═══ */
(function() {
  const trigger   = document.getElementById('level-trigger');
  const ddrop     = document.getElementById('level-dropdown');
  const realSel   = document.getElementById('skill-level');
  const trigText  = document.getElementById('level-trigger-text');
  const levelWrap = document.getElementById('level-wrap');

  const LABELS = { '1': 'Beginner', '2': 'Intermediate', '3': 'Expert' };

  function openLevel()  { ddrop.classList.add('open'); trigger.classList.add('open'); }
  function closeLevel() { ddrop.classList.remove('open'); trigger.classList.remove('open'); }
  function setLevel(val) {
    realSel.value = val;
    trigText.textContent = LABELS[val];
    ddrop.querySelectorAll('.level-option').forEach(o => {
      o.classList.toggle('selected', o.dataset.value === val);
    });
    closeLevel();
  }

  trigger.addEventListener('mousedown', e => {
    e.preventDefault();
    ddrop.classList.contains('open') ? closeLevel() : openLevel();
  });

  ddrop.querySelectorAll('.level-option').forEach(opt => {
    opt.addEventListener('mousedown', e => {
      e.preventDefault();
      setLevel(opt.dataset.value);
    });
  });

  document.addEventListener('click', e => {
    if (!levelWrap.contains(e.target)) closeLevel();
  });

  // Expose reset function so addSkill can reset it
  window._resetLevelDropdown = () => setLevel('1');
})();

/* ═══ INIT ═══ */
window.PathwiseSupabaseReady.then((api) => {
  const session = api.getSession();
  const resumeMode = (() => {
    try {
      return localStorage.getItem('pw_resume_mode') || '';
    } catch (error) {
      return '';
    }
  })();
  if (session?.user || resumeMode === 'guest') {
    const resumeStep = api.getPendingStep ? api.getPendingStep() : getSavedStep();
    api.enterAnalyzer(resumeStep);
  }
});

loadState();
const addBtn = document.getElementById('add-btn');
// mousedown: prevent default so input doesn't lose focus (blur event fires)
addBtn.addEventListener('mousedown', e => {
  e.preventDefault();
  _addingSkill = true; // set flag early so blur handler sees it
});
addBtn.addEventListener('click', addSkill);
document.getElementById('analyze-btn').onclick = analyze;

// Enter on skill input: add skill; Ctrl/Cmd+Enter anywhere on page: analyze
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    if (skills.length > 0) analyze();
  }
});

renderRoles();
renderRoleScope();
renderRequiredSkills();
renderSkillList();




/* ═══ PORTFOLIO PROJECTS DATA ═══ */
const PORTFOLIO_PROJECTS = {
  "Data Analyst": [
    {
      title: "Sales Performance Dashboard",
      skills: ["SQL", "Tableau / Power BI", "Data Visualization", "Data Cleaning"],
      build: "Pull raw sales data from a public dataset (e.g. Kaggle Superstore), clean it with Python/Excel, then build an interactive Tableau or Power BI dashboard showing KPIs, regional breakdowns, and trend lines.",
      why: "Dashboards are the #1 deliverable hiring managers ask for in portfolio reviews. A clean, real-looking dashboard immediately signals you can do the actual job."
    },
    {
      title: "Customer Churn Prediction Analysis",
      skills: ["Python", "Statistics", "Data Cleaning", "Business Intelligence"],
      build: "Use a public telecom or SaaS churn dataset. Clean the data, run exploratory analysis, build a logistic regression model, and present findings in a clear written report with visualisations.",
      why: "Churn analysis demonstrates end-to-end data skills — querying, cleaning, modelling, and communicating. It appears in real analyst interviews at companies of every size."
    },
    {
      title: "SQL Portfolio: Answering Business Questions",
      skills: ["SQL", "Business Intelligence", "Communication"],
      build: "Use a public database (e.g. the Northwind DB or a public e-commerce dataset). Write 10–15 progressively complex SQL queries that answer real business questions. Publish them on GitHub with explanations.",
      why: "SQL proficiency is tested in virtually every data analyst interview. A public GitHub repo of well-commented SQL shows both technical and communication skills."
    }
  ],
  "Frontend Developer": [
    {
      title: "Personal Finance Tracker App",
      skills: ["React", "TypeScript", "HTML & CSS", "Responsive Design"],
      build: "Build a single-page React app where users can log income/expenses by category, see a running balance, and view a monthly summary chart. Make it fully responsive and deploy it on Vercel.",
      why: "A deployed, functional app with real CRUD operations shows you can build product — not just landing pages. Interviewers can actually click around and test it."
    },
    {
      title: "Component Library with Storybook",
      skills: ["React", "TypeScript", "Accessibility", "Testing (Jest/RTL)"],
      build: "Build a small design system: 8–10 reusable components (Button, Card, Modal, Input, etc.) with TypeScript props, accessibility attributes, and stories in Storybook. Write Jest tests for each.",
      why: "Every serious frontend team uses a component library. Building one proves you understand abstraction, testing, and accessibility — three things juniors typically skip."
    },
    {
      title: "Real-Time Collaborative Whiteboard",
      skills: ["JavaScript", "React", "Performance Optimization", "TypeScript"],
      build: "Build a shared canvas using HTML5 Canvas and WebSockets (or a service like Pusher). Users on the same room link can draw simultaneously. Focus on smooth performance and real-time sync.",
      why: "Demonstrates advanced JavaScript, state management, and performance thinking — all in one. It stands out in portfolios because most juniors stick to CRUD apps."
    }
  ],
  "Software Developer": [
    {
      title: "CLI Task Manager with Persistent Storage",
      skills: ["Python / Java / C++", "Data Structures & Algorithms", "Unit Testing"],
      build: "Build a command-line task manager in Python or Java. Support add/list/complete/delete commands, store tasks in a JSON file, and write unit tests for all operations. Publish on GitHub.",
      why: "A well-tested CLI tool shows algorithmic thinking, file I/O, and software craftsmanship — all skills that come up in technical interviews at every level."
    },
    {
      title: "REST API with Full Test Coverage",
      skills: ["REST APIs", "Unit Testing", "SQL / Databases", "CI/CD Pipelines"],
      build: "Build a REST API (e.g. a book tracking or recipe API) with CRUD endpoints, a SQL database, input validation, and 80%+ test coverage. Add a GitHub Actions CI pipeline that runs tests on every push.",
      why: "APIs with tests and CI are how professional developers actually work. This project proves you understand the full development lifecycle — not just writing code."
    },
    {
      title: "Algorithm Visualiser",
      skills: ["Data Structures & Algorithms", "JavaScript", "System Design"],
      build: "Build a web page that animates sorting algorithms (bubble, merge, quicksort) and path-finding (BFS, Dijkstra) with speed controls. Implement each algorithm from scratch in JavaScript.",
      why: "Forces deep understanding of the algorithms that come up in every technical interview. Interviewers love seeing this — it shows you can both implement and explain your work."
    }
  ],
  "Backend Developer": [
    {
      title: "URL Shortener with Analytics API",
      skills: ["Python / Node.js / Java", "REST APIs", "SQL Databases", "Authentication & Security"],
      build: "Build a URL shortener service with JWT auth, rate limiting, click tracking per link, and a dashboard endpoint showing analytics. Deploy on Railway or Render with a proper README.",
      why: "URL shorteners are a classic system design interview question. Building a real one — with auth, rate limiting, and analytics — shows backend depth in a compact project."
    },
    {
      title: "Real-Time Chat API with WebSockets",
      skills: ["Python / Node.js / Java", "NoSQL Databases", "Docker / Containers", "Authentication & Security"],
      build: "Build a multi-room chat backend with WebSocket connections, JWT-based auth, and MongoDB for message persistence. Containerise with Docker and document the API with Swagger/OpenAPI.",
      why: "Chat APIs demonstrate concurrent connections, database design, auth, and containerisation in one project — covering the most commonly tested backend concepts."
    },
    {
      title: "Event-Driven Notification Service",
      skills: ["REST APIs", "Cloud Platforms", "CI/CD Pipelines", "System Design"],
      build: "Build a microservice that accepts webhook events (e.g. from Stripe) and dispatches email/SMS notifications. Use a message queue (Redis or SQS), deploy on a cloud platform, and write a clear system design doc.",
      why: "Event-driven architecture is how modern backends scale. Building and explaining this system positions you as someone who thinks beyond simple request-response patterns."
    }
  ],
  "Machine Learning Engineer": [
    {
      title: "End-to-End ML Pipeline with Deployment",
      skills: ["Python", "Scikit-learn", "MLOps / Deployment", "Feature Engineering"],
      build: "Train a classification model (e.g. spam detection or heart disease prediction) with full preprocessing, feature engineering, cross-validation, and model selection. Deploy as a REST API using FastAPI and host on Hugging Face Spaces or Railway.",
      why: "Most ML portfolios stop at a Jupyter notebook. Deploying an actual endpoint shows you understand the full pipeline — and that's exactly what ML engineer roles demand."
    },
    {
      title: "Deep Learning Image Classifier",
      skills: ["Deep Learning (PyTorch/TF)", "Python", "Model Evaluation", "Feature Engineering"],
      build: "Train a CNN (or fine-tune ResNet/EfficientNet) on a custom image dataset. Write a full evaluation report with confusion matrix, per-class metrics, and error analysis. Document training decisions and tradeoffs.",
      why: "Deep learning projects are expected in any ML portfolio. Writing a serious evaluation report — not just accuracy — shows the rigour that separates candidates at interview."
    },
    {
      title: "Recommendation System",
      skills: ["Python", "Statistics & Probability", "SQL / Data Processing", "Model Evaluation"],
      build: "Build a collaborative filtering recommender using the MovieLens or similar public dataset. Implement user-based and item-based approaches, evaluate with RMSE and precision@k, and write a blog-style writeup.",
      why: "Recommendation systems appear in interviews at e-commerce, streaming, and marketplace companies. Understanding the maths behind them — and being able to explain it — is a major differentiator."
    }
  ],
  "QA Engineer": [
    {
      title: "Automated Test Suite for a Public App",
      skills: ["Selenium / Playwright", "Test Case Writing", "Bug Reporting & Tracking (Jira)", "CI/CD Pipelines"],
      build: "Write a full automated regression suite using Playwright for a public web app (e.g. a demo e-commerce site). Include page object models, parallel test execution, and a GitHub Actions CI job that runs tests on every push.",
      why: "A working Playwright suite in a public repo is the single most convincing QA portfolio item. It shows test design, automation skills, and CI in one real artefact."
    },
    {
      title: "API Test Framework from Scratch",
      skills: ["API Testing (Postman)", "Python / Java (Scripting)", "SQL / Database Testing"],
      build: "Build a REST API test framework using Python (pytest + requests) or Postman/Newman. Cover auth flows, CRUD operations, edge cases, and data validation against the database. Generate HTML reports.",
      why: "API testing is where most QA roles spend their time. A custom framework — not just Postman collections — proves you can code, which is required for most senior QA positions."
    },
    {
      title: "Bug Report Portfolio with Root Cause Analysis",
      skills: ["Manual Testing", "Test Case Writing", "Bug Reporting & Tracking (Jira)"],
      build: "Manually test 2–3 real open-source apps or staging environments. Write 10+ detailed Jira-style bug reports with steps to reproduce, expected vs actual behaviour, severity ratings, and root cause hypotheses. Publish as a PDF or Notion doc.",
      why: "Clear bug reports are the core QA skill. A portfolio of well-written reports — with root cause analysis — shows thinking ability that automation alone cannot demonstrate."
    }
  ],
  "Full Stack Developer": [
    {
      title: "Full-Stack SaaS Starter",
      skills: ["React / Vue / Angular", "Node.js / Python / Java", "Authentication & Security", "SQL Databases"],
      build: "Build a minimal SaaS app with auth (signup/login/logout), a user dashboard, a database-backed feature (e.g. saved notes or tasks), and a subscription-gated area. Use React + Node/Express + PostgreSQL. Deploy on Vercel/Railway.",
      why: "Most companies build SaaS products. A deployed full-stack app with auth and a database proves you can build and ship real software end to end."
    },
    {
      title: "Real-Time Collaborative Document Editor",
      skills: ["HTML & CSS", "JavaScript", "REST APIs", "NoSQL Databases"],
      build: "Build a Google Docs-style editor where multiple users can type simultaneously (using CRDTs or OT with WebSockets). Persist documents to MongoDB. Add basic formatting toolbar.",
      why: "Real-time collaboration is technically demanding — it touches frontend state, WebSockets, data consistency, and backend persistence all at once. It immediately stands out."
    },
    {
      title: "Developer Portfolio with CMS",
      skills: ["React / Vue / Angular", "REST APIs", "Docker / Containers", "Git / Version Control"],
      build: "Build your own portfolio site with a headless CMS (Contentful or Sanity) for blog posts and project entries. Containerise with Docker, set up automated deployments via GitHub Actions, and achieve 90+ Lighthouse score.",
      why: "A technically excellent portfolio site is your live CV. Showing performance optimisation, CI/CD, and containerisation tells employers you ship production-quality work."
    }
  ],
  "Game Developer": [
    {
      title: "2D Platformer in Unity",
      skills: ["C++ / C#", "Unity / Unreal Engine", "Game Design Principles", "Version Control (Git)"],
      build: "Build a 2D platformer with at least 3 levels, a character controller, enemies with basic AI (patrol + attack), collectables, and a score system. Publish on itch.io and source on GitHub.",
      why: "A published itch.io game is the game dev equivalent of a live website. It shows you can take a project from concept to shipped — the most important signal for any game studio."
    },
    {
      title: "3D Physics Sandbox",
      skills: ["C++ / C#", "Physics Simulation", "Linear Algebra & Maths", "Performance Optimisation"],
      build: "Build an Unreal or Unity scene with custom physics interactions: destructible objects, fluid-like particle behaviour, and a player character that can push/stack/throw rigidbodies. Profile and document your performance optimisations.",
      why: "Physics programming is one of the most technically tested areas in game dev interviews. A sandbox that shows custom physics work — and your optimisation process — is powerful evidence."
    },
    {
      title: "Custom Shader Showcase",
      skills: ["Shader Programming (HLSL/GLSL)", "Unity / Unreal Engine", "3D Modelling Basics (Blender)"],
      build: "Create a short Unity or Unreal scene using 5+ custom shaders you wrote: water, fire, cel-shading, a stylised sky, and one original effect. Write a technical breakdown for each shader explaining the maths.",
      why: "Shader programming is a specialist skill that commands attention. A shader showcase with documented maths demonstrates graphics depth that few junior candidates can match."
    }
  ],
  "DevOps Engineer": [
    {
      title: "Kubernetes-Deployed Microservices App",
      skills: ["Docker / Kubernetes", "CI/CD (Jenkins/GitHub Actions)", "Cloud Platforms (AWS/GCP/Azure)", "Monitoring (Prometheus/Grafana)"],
      build: "Deploy a 3-service application (frontend, backend, database) on a managed Kubernetes cluster (GKE or EKS free tier). Add Prometheus/Grafana monitoring, horizontal pod autoscaling, and a full CI/CD pipeline via GitHub Actions.",
      why: "This project covers the entire modern DevOps stack. A working K8s deployment with monitoring and CI/CD in a GitHub repo is the gold standard DevOps portfolio item."
    },
    {
      title: "Infrastructure as Code with Terraform",
      skills: ["Infrastructure as Code (Terraform)", "Cloud Platforms (AWS/GCP/Azure)", "Security Best Practices", "Networking Basics"],
      build: "Write Terraform modules to provision a full cloud environment: VPC, subnets, security groups, EC2/Cloud Run instances, and a managed database. Apply least-privilege IAM policies and document the architecture.",
      why: "IaC is expected in every senior DevOps role. A well-structured Terraform project on GitHub — with modules, state management, and security — shows professional-level infrastructure thinking."
    },
    {
      title: "Zero-Downtime Deployment Pipeline",
      skills: ["CI/CD (Jenkins/GitHub Actions)", "Linux / Shell Scripting", "Docker / Kubernetes", "Monitoring (Prometheus/Grafana)"],
      build: "Set up a blue/green or canary deployment pipeline for a containerised app. Automated tests gate each stage, with rollback triggered if error rate exceeds a threshold measured in Grafana.",
      why: "Zero-downtime deployments are what separate DevOps engineers from sysadmins. Understanding blue/green strategies and automated rollback is asked about in almost every senior DevOps interview."
    }
  ],
  "Cybersecurity": [
    {
      title: "Home Lab SIEM Setup with Real Alerts",
      skills: ["SIEM Tools (Splunk/QRadar)", "Network Security", "Threat Detection & Analysis", "Linux / Windows Administration"],
      build: "Set up a free Splunk or Elastic SIEM in a home lab (VMs). Generate log data from simulated attacks (using tools like Metasploit on an isolated network), write detection rules, and document 5+ real alerts you triggered and investigated.",
      why: "Hands-on SIEM experience is one of the clearest signals in cybersecurity hiring. Documenting real alerts you built and investigated proves practical skill that certifications alone cannot."
    },
    {
      title: "Vulnerability Assessment Report",
      skills: ["Vulnerability Assessment", "Network Security", "Python / Scripting", "Compliance & Frameworks (NIST/ISO)"],
      build: "Run a full vulnerability scan on a deliberately vulnerable VM (Metasploitable or DVWA). Document findings in a professional pentest-style report: scope, methodology, findings with CVSS scores, and remediation recommendations mapped to NIST controls.",
      why: "A professional-quality vulnerability report shows you can communicate risk to stakeholders — a core output across many cybersecurity roles."
    },
    {
      title: "Incident Response Playbook + Tabletop Simulation",
      skills: ["Incident Response", "Threat Detection & Analysis", "SIEM Tools (Splunk/QRadar)", "Compliance & Frameworks (NIST/ISO)"],
      build: "Write a detailed IR playbook for 3 scenarios (ransomware, phishing, insider threat). Run a self-directed tabletop exercise for each, documenting your detection, containment, and recovery decisions. Publish as a PDF portfolio piece.",
      why: "IR planning is a core competency tested in every blue-team interview. A published playbook signals structured thinking and preparation — exactly what security teams want."
    }
  ],
  "Cloud Architect": [
    {
      title: "Multi-Tier Cloud Architecture with Auto-Scaling",
      skills: ["AWS / Azure / GCP (Advanced)", "Cloud Architecture Design", "Networking (VPC, DNS, Load Balancing)", "Cost Optimisation"],
      build: "Design and deploy a three-tier application (web, app, data) on AWS or GCP with load balancers, auto-scaling groups, a managed database, CloudFront CDN, and Route53 DNS. Document the architecture with a proper diagram and cost estimate.",
      why: "A real deployed multi-tier architecture with a cost analysis is what architecture interviews ask you to design. Having one already built and documented puts you ahead of most candidates."
    },
    {
      title: "Serverless Event-Driven Data Pipeline",
      skills: ["Serverless Architecture", "Infrastructure as Code (Terraform/CDK)", "Security & IAM", "Cloud Platforms (AWS/GCP/Azure)"],
      build: "Build a serverless pipeline that ingests data via API Gateway, processes it with Lambda, stores in S3 and DynamoDB, and triggers downstream notifications via SNS. Deploy entirely with Terraform or CDK. Apply least-privilege IAM throughout.",
      why: "Serverless architecture is how modern cloud-native apps are built. Understanding Lambda, event triggers, and IaC together is a combination that commands respect in architect-level interviews."
    },
    {
      title: "FinOps Dashboard: Cloud Cost Analysis",
      skills: ["Cost Optimisation", "Multi-cloud Strategy", "Cloud Architecture Design", "DevOps / CI/CD Integration"],
      build: "Use AWS Cost Explorer or GCP Billing APIs to build a cost analysis dashboard. Identify waste (idle resources, oversized instances), implement tagging policies, and write a report estimating savings. Implement at least 2 cost optimisation changes.",
      why: "Cloud cost overruns are a major pain point for every organisation. A candidate who can demonstrate real cost-saving analysis stands out immediately — especially for senior and architect-level roles."
    }
  ],
  "Gen AI Developer": [
    {
      title: "RAG-Powered Document Q&A App",
      skills: ["LLM APIs (OpenAI / Anthropic / Gemini)", "RAG (Retrieval-Augmented Generation)", "Vector Databases (Pinecone / Chroma)", "REST APIs / FastAPI"],
      build: "Build an app that lets users upload PDFs and ask questions about them. Chunk and embed documents into a vector database, retrieve relevant chunks, and pass them to an LLM. Build a FastAPI backend and a simple frontend. Deploy it publicly.",
      why: "RAG is the most in-demand Gen AI pattern in industry right now. A deployed, working RAG app immediately signals you understand the full stack — not just prompt engineering."
    },
    {
      title: "LLM-Powered Coding Assistant",
      skills: ["Prompt Engineering", "LangChain / LlamaIndex", "Evaluation & Testing of LLMs", "Python"],
      build: "Build a coding assistant using LangChain that can explain code, suggest refactors, and answer programming questions. Implement conversation memory, tool use (e.g. run code), and a systematic evaluation suite comparing prompt variants.",
      why: "This project combines prompt engineering, tool use, memory management, and evaluation — covering the four most tested Gen AI concepts in a single coherent product."
    },
    {
      title: "Fine-Tuned Domain-Specific Chatbot",
      skills: ["Fine-tuning & Model Adaptation", "Python", "LLM APIs (OpenAI / Anthropic / Gemini)", "Evaluation & Testing of LLMs"],
      build: "Fine-tune a small open-source model (e.g. Mistral 7B via LoRA) on a domain-specific dataset (medical Q&A, legal terms, cooking). Build an evaluation harness comparing it to the base model on your test set. Document the process in a technical writeup.",
      why: "Fine-tuning is the differentiator between Gen AI developers and AI API wrappers. Candidates who understand training dynamics and can run experiments are rare and highly valued."
    }
  ],
  "QA Engineer": [
    {
      title: "Automated Test Suite for a Public App",
      skills: ["Selenium / Playwright", "Test Case Writing", "CI/CD Pipelines"],
      build: "Write a full automated regression suite using Playwright for a public web app. Include page object models, parallel test execution, and a GitHub Actions CI job.",
      why: "A working Playwright suite in a public repo shows test design, automation skills, and CI in one real artefact."
    },
    {
      title: "API Test Framework from Scratch",
      skills: ["API Testing (Postman)", "Python / Java (Scripting)", "SQL / Database Testing"],
      build: "Build a REST API test framework using pytest + requests. Cover auth flows, CRUD operations, and edge cases. Generate HTML reports.",
      why: "API testing is where most QA roles spend their time. A custom framework proves you can code — required for most senior QA positions."
    },
    {
      title: "Bug Report Portfolio",
      skills: ["Manual Testing", "Test Case Writing", "Bug Reporting & Tracking (Jira)"],
      build: "Manually test 2–3 real open-source apps. Write 10+ detailed Jira-style bug reports with steps, severity, and root cause analysis. Publish as a PDF.",
      why: "Clear bug reports are the core QA skill. A portfolio of well-written reports demonstrates thinking ability that automation alone cannot."
    }
  ]
};

function getPortfolioProjects(role, missing, matched) {
  // Base pool from role, fallback to generic
  let pool = PORTFOLIO_PROJECTS[role] || [];
  if (pool.length === 0) {
    pool = [
      {
        title: "End-to-End Feature Project",
        skills: missing.slice(0,3).map(s => s.name),
        build: "Pick a real problem you care about and build a small application that exercises your most critical missing skills. Keep scope tight, ship it, and write a README explaining your decisions.",
        why: "A shipped project that solves a real problem beats an unfinished ambitious one every time. Employers want to see that you can take something to completion."
      }
    ];
  }
  // Score each project by how many of its skills overlap with missing skills
  const missingNames = missing.map(s => s.name.toLowerCase());
  const scored = pool.map(p => {
    const overlap = p.skills.filter(skill => missingNames.some(m => m.includes(skill.toLowerCase()) || skill.toLowerCase().includes(m))).length;
    return { ...p, overlap };
  }).sort((a, b) => b.overlap - a.overlap);
  return scored.slice(0, 3);
}

/* ═══ WHY THESE SKILLS MATTER ═══ */
const SKILL_REASONS = {
  "SQL": "The lingua franca of data. Every database, BI tool, and analytics platform requires SQL to query and manipulate data.",
  "Python": "The most versatile language in tech. Used for scripting, automation, data analysis, machine learning, and backend development.",
  "Excel / Google Sheets": "Used daily in almost every office role. Essential for data wrangling, reporting, and quick analysis without code.",
  "Data Visualization": "Turning raw numbers into insights. Employers need people who can communicate data through charts and dashboards.",
  "Statistics": "The foundation of data analysis and ML. Without statistics, you can't interpret results or validate models.",
  "Tableau / Power BI": "Industry-standard BI tools used by analysts worldwide to build dashboards and self-serve reports.",
  "Data Cleaning": "80% of a data analyst's job is cleaning messy data. This skill is non-negotiable in practice.",
  "Business Intelligence": "Connects data to business decisions — exactly what employers want from a data analyst.",
  "Communication": "Technical skills only create value if you can explain findings clearly to non-technical stakeholders.",
  "HTML & CSS": "The building blocks of every webpage. Without them, you can't lay out or style any web interface.",
  "JavaScript": "The language of the web. Every interactive element on any website runs on JavaScript.",
  "React": "The dominant frontend framework used by thousands of companies. Expected in almost every frontend job description.",
  "TypeScript": "Adds type safety to JavaScript, reducing bugs and improving team scalability. Widely adopted in modern frontends.",
  "Responsive Design": "Over 50% of web traffic is mobile. Building sites that work on all screen sizes is a core requirement.",
  "Git / Version Control": "The standard tool for collaborating on code. You cannot work in a real dev team without knowing Git.",
  "Testing (Jest/RTL)": "Writing tests proves your code works and prevents regressions. Companies expect at least basic testing knowledge.",
  "Performance Optimization": "Slow websites lose users. Optimising load times and rendering is a valued and increasingly essential skill.",
  "Accessibility": "Legal requirement in many countries and a mark of quality. Inclusive design makes products usable by everyone.",
  "Data Structures & Algorithms": "The foundation of technical interviews at any serious company. Required to write efficient code at scale.",
  "Object-Oriented Programming": "The dominant programming paradigm in enterprise software. Needed to read, write, and maintain most codebases.",
  "Python / Java / C++": "Core programming languages used across industries. Proficiency in at least one is the minimum bar for any developer role.",
  "REST APIs": "The standard way applications communicate over the internet. Building and consuming APIs is a daily developer task.",
  "Unit Testing": "Employers expect developers to test their own code. Untested code is a liability in production systems.",
  "SQL / Databases": "Almost every application stores data. Understanding databases is fundamental to building anything real.",
  "CI/CD Pipelines": "Automating build and deployment saves time and reduces human error. Expected in modern engineering teams.",
  "System Design": "At senior levels, you design systems, not just write code. Starting to think in systems early gives you a huge edge.",
  "Code Review": "A core part of team-based development. Good code review skills show maturity and collaborative ability.",
  "Python / Node.js / Java": "Server-side languages that power the business logic of applications. Fundamental to any backend role.",
  "SQL Databases": "Relational databases store the majority of the world's structured data. Essential for any backend developer.",
  "Authentication & Security": "Security breaches are costly. Every backend developer must understand auth flows and common vulnerabilities.",
  "Docker / Containers": "Containers ensure consistent environments across dev and production. The default standard in modern deployment.",
  "NoSQL Databases": "For high-scale or unstructured data problems, NoSQL databases like MongoDB are essential alternatives to SQL.",
  "Cloud Platforms": "Most modern infrastructure runs on AWS, GCP, or Azure. Cloud skills are expected in nearly all backend roles.",
  "Statistics & Probability": "ML is applied statistics. Without this foundation, you cannot design experiments or understand model behaviour.",
  "Linear Algebra": "Neural networks and many ML algorithms are fundamentally matrix operations. Essential for deep learning.",
  "Scikit-learn": "The go-to Python library for classical ML. Used in data science roles worldwide for rapid model prototyping.",
  "Deep Learning (PyTorch/TF)": "Powers computer vision, NLP, and generative AI. Increasingly expected even for non-research ML roles.",
  "Feature Engineering": "Often more impactful than the model itself. Transforming raw data into meaningful features is a core ML skill.",
  "Model Evaluation": "Building a model is step one. Knowing if it actually works — and why — requires rigorous evaluation skills.",
  "SQL / Data Processing": "ML engineers deal with large datasets daily. Efficient data querying and processing is a practical must-have.",
  "MLOps / Deployment": "A model no one can use is worthless. Deploying, monitoring, and maintaining models in production is a growing skill gap.",
  "Figma": "The industry-standard design tool. If you can't use Figma, you can't collaborate with modern design teams.",
  "User Research": "Great design starts with understanding users. Research skills turn assumptions into evidence-backed decisions.",
  "Wireframing & Prototyping": "Prototypes save months of engineering time by validating ideas before they're built. Core to any design process.",
  "Visual Design": "The aesthetics of a product affect trust and usability. Strong visual design skills make your work stand out.",
  "Usability Testing": "Testing with real users uncovers problems you'd never find on your own. It's the difference between guessing and knowing.",
  "Interaction Design": "Defines how users move through a product. Poor interactions frustrate users; great ones feel invisible.",
  "Design Systems": "Used by every major tech company to maintain consistency at scale. Shows you can work professionally in large teams.",
  "HTML & CSS Basics": "Designers who understand code communicate better with developers and create more technically feasible designs.",
  "Information Architecture": "How content is organised determines whether users can find what they need. Underrated but critical skill.",
  "Product Strategy": "PMs without strategy just manage backlogs. Strategy connects product decisions to business outcomes.",
  "User Story Writing": "How requirements get communicated to engineering. Clear stories prevent misunderstandings and wasted sprints.",
  "Roadmapping": "A roadmap aligns the whole company on priorities. PMs who roadmap well earn trust from leadership and teams.",
  "Stakeholder Management": "PMs serve many masters. Managing competing priorities and keeping stakeholders aligned is a daily challenge.",
  "Data Analysis / Metrics": "You can't improve what you don't measure. Data-driven PMs make better decisions and earn more credibility.",
  "Agile / Scrum": "The operating system of most software teams. Understanding it lets you run sprints and ship product efficiently.",
  "A/B Testing": "The gold standard for validating product decisions. Running experiments shows you let data, not opinions, drive choices.",
  "Competitive Research": "Understanding the market landscape helps you position your product and spot opportunities others miss.",
  "Financial Modelling": "The core deliverable of a financial analyst. Models underpin investment decisions, forecasts, and valuations.",
  "Excel / Google Sheets (Advanced)": "Finance runs on spreadsheets. Advanced Excel skills (pivot tables, VBA, complex formulas) are a baseline expectation.",
  "Financial Statement Analysis": "Reading income statements, balance sheets, and cash flows is the fundamental literacy of any finance role.",
  "Budgeting & Forecasting": "Companies hire financial analysts specifically to build and maintain forecasts. This is the job.",
  "Valuation Techniques (DCF/Comps)": "DCF and comparable company analysis are the standard valuation frameworks used in investment banking and PE.",
  "Accounting Fundamentals": "Finance and accounting are inseparable. Understanding debits, credits, and accruals prevents costly errors.",
  "PowerPoint / Presentations": "Financial insights only matter if communicated clearly. Slide-building is a daily task in most finance roles.",
  "Data Visualisation (Power BI/Tableau)": "Modern finance teams are moving beyond Excel charts. BI tools help analysts present data more clearly.",
  "Attention to Detail": "A single wrong number in a financial model can mislead a multi-million-pound decision. Precision is everything.",
  "Linux / Shell Scripting": "Servers run Linux. Scripting automates repetitive tasks. Every DevOps engineer must be fluent on the command line.",
  "Docker / Kubernetes": "The container stack that powers modern cloud-native deployments. Essential for managing applications at scale.",
  "CI/CD (Jenkins/GitHub Actions)": "Automating testing and deployment pipelines is the core function of DevOps. It's literally what the role exists to do.",
  "Cloud Platforms (AWS/GCP/Azure)": "Infrastructure now lives in the cloud. Certifications and hands-on cloud skills are expected in every DevOps role.",
  "Infrastructure as Code (Terraform)": "Managing infrastructure manually is error-prone and slow. IaC makes infrastructure reproducible and version-controlled.",
  "Monitoring (Prometheus/Grafana)": "You can't fix what you can't see. Monitoring stacks are how teams detect incidents and maintain reliability.",
  "Networking Basics": "Understanding DNS, VPCs, firewalls, and load balancers is essential for designing and debugging cloud infrastructure.",
  "Security Best Practices": "DevOps engineers are often the last line of defence before deployment. Secure defaults and least privilege are critical.",
  "Network Security": "Most attacks happen at the network level. Understanding protocols, firewalls, and traffic analysis is foundational.",
  "Threat Detection & Analysis": "Identifying threats in real-time separates proactive security teams from reactive ones. Core to any SOC role.",
  "SIEM Tools (Splunk/QRadar)": "SIEM platforms are where security analysts live. Proficiency in at least one is expected in every analyst role.",
  "Vulnerability Assessment": "Finding weaknesses before attackers do is the entire premise of cybersecurity. Regular assessments are industry standard.",
  "Incident Response": "When breaches happen, a clear, practiced response minimises damage. IR planning is a core professional competency.",
  "Linux / Windows Administration": "Attackers target systems. Defenders must understand them. OS administration is a baseline skill for any security role.",
  "Python / Scripting": "Automating log parsing, writing detection rules, and building security tools all require scripting ability.",
  "Cryptography Basics": "Encryption underpins data security, authentication, and secure communications. Every security professional needs this foundation.",
  "Compliance & Frameworks (NIST/ISO)": "Organisations must meet regulatory requirements. Knowledge of frameworks like NIST and ISO 27001 is increasingly expected.",
  "AWS / Azure / GCP (Advanced)": "Cloud architects design the infrastructure that entire companies run on. Deep platform expertise is non-negotiable.",
  "Cloud Architecture Design": "The primary output of this role. Designing scalable, resilient, cost-efficient architectures is what cloud architects are hired to do.",
  "Infrastructure as Code (Terraform/CDK)": "Modern cloud infrastructure is defined in code. IaC enables repeatability, version control, and team collaboration.",
  "Networking (VPC, DNS, Load Balancing)": "Cloud networks are complex. Misconfigurations cause outages and security breaches. Deep networking knowledge is essential.",
  "Security & IAM": "Cloud breaches often come from misconfigured permissions. Identity and access management is a critical architectural concern.",
  "Kubernetes / Container Orchestration": "Most cloud-native applications run in containers. Kubernetes expertise is expected at the architect level.",
  "Cost Optimisation": "Cloud bills can spiral. Architects who design for cost efficiency create real, measurable business value.",
  "Serverless Architecture": "Serverless reduces operational overhead significantly. Knowing when and how to use it is a mark of architectural maturity.",
  "Multi-cloud Strategy": "Avoiding vendor lock-in and designing for resilience often requires multi-cloud thinking. Increasingly expected at senior levels.",
  "DevOps / CI/CD Integration": "Architects must design systems that teams can actually deploy and maintain. DevOps integration is part of good architecture.",
  "SAP ERP Modules (FI/CO/MM/SD)": "SAP modules are the functional heart of enterprise systems. Consultants must know at least one module deeply.",
  "SAP S/4HANA": "SAP's latest ERP platform is what most large organisations are migrating to. S/4HANA expertise is increasingly required.",
  "SAP Configuration & Customising": "SAP consulting is primarily configuration work. The ability to set up and tailor SAP to client needs is the core deliverable.",
  "Business Process Analysis": "SAP implementations fail when the system doesn't match real business processes. Process analysis bridges IT and business.",
  "SAP ABAP (Basics)": "ABAP is SAP's proprietary language. Even functional consultants need basics to work with developers and read code.",
  "SAP Fiori / UI5": "Modern SAP interfaces run on Fiori. As clients modernise their UI, Fiori skills are becoming a differentiator.",
  "Data Migration (LSMW/BAPI)": "Every SAP implementation involves moving data from legacy systems. Data migration is a critical and often underestimated workstream.",
  "Integration (SAP PI/PO / BTP)": "SAP rarely stands alone. Integration with other enterprise systems via middleware is a key consulting skill.",
  "Project Management": "SAP projects are complex, multi-year programmes. Consultants who can manage workstreams are far more valuable.",

  "Manual Testing": "The baseline skill of QA. Before automating anything, you must know how to test software thoroughly by hand.",
  "Test Case Writing": "Clear, repeatable test cases are how QA engineers communicate what was tested and what passed or failed.",
  "Selenium / Playwright": "The leading browser automation frameworks. Automating regression tests saves hours of manual effort on every release.",
  "API Testing (Postman)": "Most modern apps are API-driven. Testing APIs directly catches bugs before they reach the UI layer.",
  "Bug Reporting & Tracking (Jira)": "A bug only gets fixed if it's reported clearly. Jira is the industry-standard tool for tracking issues through to resolution.",
  "SQL / Database Testing": "Data integrity bugs are often invisible in the UI. Direct database testing catches them at the source.",
  "Performance Testing (JMeter)": "Functional correctness isn't enough — systems must handle real-world load. Performance testing prevents production failures.",
  "Python / Java (Scripting)": "Writing automation scripts requires programming ability. Even functional testers need scripting basics to work in modern teams.",
  "React / Vue / Angular": "Full stack developers must own the frontend too. Proficiency in a modern framework is expected on both sides of the stack.",
  "Node.js / Python / Java": "Server-side programming is half the job. Full stack developers write business logic, APIs, and database queries daily.",
  "HTML & CSS": "The foundation of every web interface. Full stack developers build frontend as well as backend, so HTML and CSS are non-negotiable.",

  "LLM APIs (OpenAI / Anthropic / Gemini)": "The core building block of Gen AI applications. Knowing how to call and configure LLM APIs is the entry point for this entire field.",
  "Prompt Engineering": "How you instruct a model determines the quality of its output. Good prompt engineering is the difference between a demo and a production-ready product.",
  "RAG (Retrieval-Augmented Generation)": "Most real-world AI apps need to work with custom data. RAG is the dominant pattern for grounding LLMs in your own knowledge base.",
  "LangChain / LlamaIndex": "The most widely adopted frameworks for building LLM-powered applications. Knowing one significantly speeds up development.",
  "Vector Databases (Pinecone / Chroma)": "RAG and semantic search require vector storage. These databases are fundamental infrastructure for modern AI apps.",
  "Fine-tuning & Model Adaptation": "Off-the-shelf models don't always fit your use case. Fine-tuning lets you customise model behaviour for specific tasks.",
  "REST APIs / FastAPI": "AI models need to be served via APIs to be useful. FastAPI is the go-to framework for wrapping Python AI code into production endpoints.",
  "Evaluation & Testing of LLMs": "LLMs are non-deterministic. Systematic evaluation is how you know your AI product actually works reliably.",

  "C++ / C#": "The two dominant languages in game development. C++ powers Unreal Engine and performance-critical systems; C# is the scripting language for Unity.",
  "Unity / Unreal Engine": "The industry-standard game engines. Unity dominates indie and mobile; Unreal powers AAA titles. Employers expect proficiency in at least one.",
  "Game Design Principles": "Great code doesn't make a great game — design does. Understanding player psychology, loop design, and level design separates engineers from game developers.",
  "Linear Algebra & Maths": "Game development is applied mathematics. Vectors, matrices, and trigonometry are used constantly for movement, collisions, and 3D transformations.",
  "Physics Simulation": "Realistic physics make games feel alive. Rigidbodies, collisions, and constraints are core gameplay mechanics in most genres.",
  "3D Modelling Basics (Blender)": "Game developers who understand the 3D pipeline work better with artists and can prototype assets independently.",
  "Version Control (Git)": "Game projects involve dozens of files. Git keeps teams in sync and prevents catastrophic overwritten work.",
  "Shader Programming (HLSL/GLSL)": "Visual effects, water, lighting, and post-processing all run on shaders. Shader knowledge separates good graphics programmers from great ones.",
  "Multiplayer / Networking Basics": "Online multiplayer is expected in most modern games. Understanding latency, state synchronisation, and server architecture is increasingly essential.",
  "Performance Optimisation": "Games must run at 60fps+ on target hardware. Profiling, draw call batching, and memory management are daily concerns for any game developer.",

  "Stakeholder Communication": "SAP implementations affect entire organisations. Communicating clearly with business users and executives is essential.",
  "Structured Problem Solving": "Consultants earn their fees by solving hard problems systematically. Frameworks like MECE thinking are fundamental.",
  "Client Communication": "Your work only creates value if the client trusts and acts on it. Clear, confident communication is non-negotiable.",
  "Market Research": "Understanding market dynamics, competitors, and industry trends is the foundation of strategic consulting advice.",
  "Business Strategy": "Strategy consulting exists to help organisations make better decisions. Deep understanding of strategy frameworks is core.",
  "Storytelling / Presentation": "Consultants present to senior executives regularly. The ability to tell a compelling story with data is a career-defining skill.",
};

function buildWhySection(matched, missing, role) {
  const whyGrid = document.getElementById('why-grid');
  if (!whyGrid) return;
  const allRoleSkills = ROLES[role].skills;
  // Show all role skills with reasons — matched first, then missing
  const sorted = [...matched.map(s => ({...s, has: true})), ...missing.map(s => ({...s, has: false}))];
  whyGrid.innerHTML = sorted.map(s => {
    const reason = SKILL_REASONS[s.name] || `A core competency for the ${role} role, valued by employers across the industry.`;
    const dotColor = s.weight >= 5 ? '#f06060' : s.weight === 4 ? '#fb923c' : '#f5c842';
    const statusIcon = s.has ? '+' : '–';
    const statusColor = s.has ? 'var(--green)' : 'var(--red)';
    return `
      <div class="why-item">
        <div class="why-skill-name">
          <span class="why-skill-dot" style="background:${dotColor}"></span>
          ${s.name}
          <span style="margin-left:auto;font-size:11px;color:${statusColor};font-family:'Montserrat',sans-serif;">${statusIcon}</span>
          <span class="why-weight-pill">wt ${s.weight}</span>
        </div>
        <div class="why-skill-reason">${reason}</div>
      </div>`;
  }).join('');
}


/* ═══ CAREER PATH INSIGHTS ═══ */

function scoreRoleForSkills(roleName) {
  const role = ROLES[roleName];
  const LEVEL_MULT2  = { 1: 0.30, 2: 0.65, 3: 1.00 };
  const TIER_FACTOR2 = (w) => w >= 4 ? 1.0 : w === 3 ? 1.0 : 0.6;
  let totalPossible = 0, matchedWeight = 0, missingCritical = 0, hasCritical = false;
  role.skills.forEach(rs => {
    const tf = TIER_FACTOR2(rs.weight);
    totalPossible += rs.weight * tf;
    if (rs.weight >= 4) hasCritical = true;
    const us = skills.find(u =>
      u.name.toLowerCase().includes(rs.name.toLowerCase()) ||
      rs.name.toLowerCase().includes(u.name.toLowerCase())
    );
    if (us) {
      matchedWeight += rs.weight * (LEVEL_MULT2[us.level] || 0.30) * tf;
    } else if (rs.weight >= 4) {
      missingCritical++;
    }
  });
  const raw = (matchedWeight / totalPossible) * 100;
  const penalty = missingCritical * 3;
  const bonus = (missingCritical === 0 && hasCritical) ? 8 : 0;
  return Math.min(100, Math.max(0, Math.round(raw - penalty + bonus)));
}

function buildInsights(currentRole, currentScore) {
  const container = document.getElementById('insights-content');
  if (!container) return;

  // Score every other role
  const otherRoles = Object.keys(ROLES)
    .filter(r => r !== currentRole)
    .map(r => ({ name: r, icon: ROLES[r].icon, score: scoreRoleForSkills(r) }))
    .sort((a, b) => b.score - a.score);

  // "Next role you can target" = highest scoring role you're NOT already analysing
  const nextRole = otherRoles[0];

  // "Adjacent roles" = top 4 others, excluding nextRole
  const adjacent = otherRoles.slice(1, 5);

  const adjColor = s => s >= 70 ? 'var(--green)' : s >= 45 ? 'var(--yellow)' : 'var(--orange)';

  container.innerHTML = `
    <!-- Primary: current role score statement -->
    <div class="insights-primary">

      <div class="insights-primary-body">
        <div class="insights-primary-label">Your Primary Target</div>
        <div class="insights-primary-role">${currentRole}</div>
        <div class="insights-primary-sub">
          ${currentScore >= 75
            ? "You're a strong candidate — start applying with confidence."
            : currentScore >= 50
            ? "Good progress. Keep building the missing skills to close the gap."
            : "Focus on the top 3 priority skills to move up a tier quickly."}
        </div>
      </div>
      <div class="insights-primary-score">
        ${currentScore}%
        <span>readiness</span>
      </div>
    </div>



    <!-- Adjacent roles -->
    <div class="insights-adjacent-label">Closest Adjacent Roles</div>
    <div class="insights-adjacent-grid">
      ${adjacent.map(r => `
        <div class="insights-adj-item">

          <div class="insights-adj-body">
            <div class="insights-adj-name">${r.name}</div>
            <div class="insights-adj-bar-wrap">
              <div class="insights-adj-bar" data-target="${r.score}" style="background:${adjColor(r.score)}"></div>
            </div>
            <div class="insights-adj-pct" style="color:${adjColor(r.score)}">${r.score}% ready</div>
          </div>
        </div>`).join('')}
    </div>
  `;

  // Animate adjacent bars
  setTimeout(() => {
    container.querySelectorAll('.insights-adj-bar').forEach(b => {
      b.style.width = b.dataset.target + '%';
    });
  }, 120);
}

function renderPortfolioProjects(role, missing, matched) {
  const el = document.getElementById('portfolio-projects-block');
  if (!el) return;
  el.style.visibility = '';
  el.style.maxHeight = '';
  el.style.overflow = '';
  el.style.margin = '';
  requestAnimationFrame(() => {
    el.classList.remove('visible');
    requestAnimationFrame(() => {
      const rect = el.getBoundingClientRect();
      if (rect.top < window.innerHeight - 40) {
        el.classList.add('visible');
      } else if (revealObserver) {
        revealObserver.observe(el);
      } else {
        el.classList.add('visible');
      }
    });
  });
  const projects = getPortfolioProjects(role, missing, matched);
  el.innerHTML = `
    <div style="margin-bottom:10px;">
      <div style="font-family:'Montserrat',sans-serif;font-size:10px;text-transform:uppercase;letter-spacing:1.4px;color:var(--text2);margin-bottom:12px;display:flex;align-items:center;gap:8px;">
        <span style="color:var(--accent2)"></span> Suggested Portfolio Projects
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px;">
        ${projects.map((p,i) => `
          <div style="background:rgba(20,40,90,0.6);border:1px solid rgba(100,150,255,0.2);border-radius:18px;padding:22px 24px;position:relative;overflow:hidden;">
            <div style="position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,transparent,${['rgba(61,110,232,0.8)','rgba(40,201,144,0.8)','rgba(232,184,75,0.8)'][i]},transparent);"></div>
            <div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:12px;">
              <div style="width:28px;height:28px;border-radius:8px;background:${['rgba(61,110,232,0.2)','rgba(40,201,144,0.15)','rgba(232,184,75,0.15)'][i]};border:1px solid ${['rgba(61,110,232,0.4)','rgba(40,201,144,0.35)','rgba(232,184,75,0.35)'][i]};display:flex;align-items:center;justify-content:center;font-size:13px;flex-shrink:0;">${['01','02','03'][i]}</div>
              <div style="font-family:'Montserrat',sans-serif;font-weight:700;font-size:14px;color:var(--text);line-height:1.3;">${p.title}</div>
            </div>
            <div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:11px;">
              ${p.skills.slice(0,4).map(s => `<span style="font-family:'Montserrat',sans-serif;font-size:10px;padding:2px 8px;border-radius:20px;background:rgba(100,150,255,0.1);border:1px solid rgba(100,150,255,0.22);color:var(--accent2);">${s}</span>`).join('')}
            </div>
            <div style="font-size:13px;color:var(--text2);line-height:1.7;margin-bottom:12px;">${p.build}</div>
            <div style="font-size:11px;color:var(--text2);background:rgba(40,201,144,0.07);border:1px solid rgba(40,201,144,0.2);border-radius:9px;padding:8px 11px;line-height:1.55;">
              <span style="color:var(--green);font-weight:700;font-family:'Montserrat',sans-serif;font-size:10px;text-transform:uppercase;letter-spacing:0.8px;">Why it helps: </span>${p.why}
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

/* ═══ TOAST ═══ */
let toastTimer = null;
function showToast(msg, type = 'error') {
  const t = document.getElementById('skill-toast');
  t.textContent = msg;
  t.className = 'skill-toast' + (type === 'success' ? ' success' : '');
  t.style.display = 'flex';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.style.display = 'none'; }, 3000);
}

/* ═══ SKILL LEARNING ROADMAP ═══ */
const ROADMAP_DURATIONS = {
  1: { label: "~2–4 weeks", weeks: 3 },
  2: { label: "~1–2 months", weeks: 6 },
  3: { label: "~2–3 months", weeks: 10 },
  4: { label: "~3–5 months", weeks: 16 },
  5: { label: "~5–8 months", weeks: 26 },
};

function buildRoadmap(matched, missing, role) {
  const timeline = document.getElementById('roadmap-timeline');
  if (!timeline) return;

  const allRoleSkills = ROLES[role].skills;

  // Sort all skills: critical missing first, then partial, then owned
  const critical = missing.filter(s => s.weight >= 4).sort((a,b) => b.weight - a.weight);
  const important = missing.filter(s => s.weight === 3).sort((a,b) => b.weight - a.weight);
  const owned = matched.sort((a,b) => b.weight - a.weight);

  const phases = [
    {
      id: 1,
      icon: '01',
      label: 'Phase 1 — Start Here',
      title: 'Critical Foundations',
      color: 'var(--accent)',
      skills: critical.slice(0, 4),
      note: critical.length === 0 ? 'All critical skills covered ✓' : null,
    },
    {
      id: 2,
      icon: '02',
      label: 'Phase 2 — Build Depth',
      title: 'Supporting Skills',
      color: 'var(--yellow)',
      skills: important.slice(0, 4),
      note: important.length === 0 ? 'All supporting skills covered ✓' : null,
    },
    {
      id: 3,
      icon: '03',
      label: 'Phase 3 — Strengthen',
      title: 'Level Up Existing Skills',
      color: 'var(--green)',
      skills: owned.filter(s => s.userLevel < 3).slice(0, 4),
      note: owned.filter(s => s.userLevel < 3).length === 0 ? 'All matched skills at Expert level ✓' : null,
    },
    {
      id: 4,
      icon: '04',
      label: 'Phase 4 — Stand Out',
      title: 'Advanced & Extra Skills',
      color: 'var(--purple)',
      skills: [...critical.slice(4), ...important.slice(4)].slice(0, 4),
      note: (critical.length <= 4 && important.length <= 4) ? 'Complete phases 1\u20133 and you\'re fully role-ready!' : null,
    },
  ];

  timeline.innerHTML = phases.map(phase => {
    const totalWeeks = phase.skills.reduce((sum, s) => sum + (ROADMAP_DURATIONS[s.weight]?.weeks || 4), 0);
    const durationText = totalWeeks === 0 ? '' : totalWeeks <= 4 ? '~1 month' : totalWeeks <= 10 ? '~2–3 months' : totalWeeks <= 20 ? '~3–5 months' : '~5+ months';

    const skillsHTML = phase.note
      ? `<span style="font-size:12px;color:var(--green);font-style:italic;">${phase.note}</span>`
      : phase.skills.map(s => {
          const isOwned = matched.find(m => m.name === s.name);
          return `<span class="roadmap-skill-tag ${isOwned ? 'owned' : 'missing'}">
            <span class="roadmap-skill-check">${isOwned ? '+' : '·'}</span>
            ${s.name}
          </span>`;
        }).join('');

    return `
      <div class="roadmap-phase">
        <div class="roadmap-node phase-${phase.id}">${phase.icon}</div>
        <div class="roadmap-content">
          <div class="roadmap-phase-label">${phase.label}</div>
          <div class="roadmap-phase-title">${phase.title}</div>
          <div class="roadmap-skills-list">${skillsHTML}</div>
          ${durationText ? `<div class="roadmap-duration">⏱ Estimated time: ${durationText}</div>` : ''}
        </div>
      </div>`;
  }).join('');
}


/* ═══ SKILL DEPENDENCIES ═══ */
const SKILL_DEPS = {
  "React":                      ["JavaScript", "HTML & CSS"],
  "TypeScript":                 ["JavaScript"],
  "Testing (Jest/RTL)":         ["JavaScript", "React"],
  "Redux / State Management":   ["React", "JavaScript"],
  "React / Vue / Angular":      ["JavaScript", "HTML & CSS"],
  "Deep Learning (PyTorch/TF)": ["Python", "Statistics & Probability", "Linear Algebra"],
  "Scikit-learn":               ["Python", "Statistics & Probability"],
  "Feature Engineering":        ["Python", "Statistics & Probability"],
  "Model Evaluation":           ["Statistics & Probability"],
  "MLOps / Deployment":         ["Python", "Docker / Containers"],
  "RAG (Retrieval-Augmented Generation)": ["Python", "LLM APIs (OpenAI / Anthropic / Gemini)"],
  "LangChain / LlamaIndex":     ["Python", "LLM APIs (OpenAI / Anthropic / Gemini)"],
  "Vector Databases (Pinecone / Chroma)": ["RAG (Retrieval-Augmented Generation)"],
  "Fine-tuning & Model Adaptation": ["Python", "Deep Learning (PyTorch/TF)"],
  "Docker / Kubernetes":        ["Linux / Shell Scripting"],
  "Kubernetes / Container Orchestration": ["Docker / Containers"],
  "CI/CD (Jenkins/GitHub Actions)": ["Git / Version Control", "Linux / Shell Scripting"],
  "CI/CD Pipelines":            ["Git / Version Control"],
  "Infrastructure as Code (Terraform)": ["Cloud Platforms (AWS/GCP/Azure)", "Linux / Shell Scripting"],
  "Infrastructure as Code (Terraform/CDK)": ["Cloud Platforms (AWS/GCP/Azure)"],
  "Monitoring (Prometheus/Grafana)": ["Docker / Kubernetes"],
  "Selenium / Playwright":      ["JavaScript"],
  "Unit Testing":               ["Python / Java / C++"],
  "System Design":              ["REST APIs", "SQL / Databases"],
  "Shader Programming (HLSL/GLSL)": ["Unity / Unreal Engine", "Linear Algebra & Maths"],
  "Physics Simulation":         ["Unity / Unreal Engine", "Linear Algebra & Maths"],
  "Multiplayer / Networking Basics": ["C++ / C#"],
  "Performance Optimisation":   ["Unity / Unreal Engine"],
  "Authentication & Security":  ["REST APIs"],
  "Cloud Architecture Design":  ["AWS / Azure / GCP (Advanced)", "Networking (VPC, DNS, Load Balancing)"],
};

/* ═══ DECISION ENGINE (Upgraded Simulator) ═══ */
let simBaseScore = 0;
let simBaseTotalWeight = 0;
let simBaseMatchedWeight = 0;
let simLearnedSkills = new Set();
let simMissingSkills = [];
let simMatchedSkills = [];
let simCurrentRole   = '';

/* Compute point gain for one skill at Intermediate level */
function simSkillGain(s) {
  const tf = s.weight >= 4 ? 1.0 : s.weight === 3 ? 1.0 : 0.6;
  return s.weight * 0.65 * tf;
}

/* Compute how many "unblocked" deps a skill unlocks */
function simUnlockScore(skillName, alreadyOwned) {
  const ownedNames = new Set([...alreadyOwned.map(s => s.name), ...simLearnedSkills]);
  let score = 0;
  Object.entries(SKILL_DEPS).forEach(([skill, deps]) => {
    if (ownedNames.has(skill)) return; // already have it
    const missingDep = deps.find(d => d.toLowerCase().includes(skillName.toLowerCase()) || skillName.toLowerCase().includes(d.toLowerCase()));
    if (!missingDep) return;
    const otherDepsOk = deps.every(d => d === missingDep || ownedNames.has(d) || [...ownedNames].some(o => o.toLowerCase().includes(d.toLowerCase())));
    if (otherDepsOk) score++;
  });
  return score;
}

function buildSimulator(matched, missing, role, baseScore) {
  simBaseScore         = baseScore;
  simLearnedSkills     = new Set();
  simMissingSkills     = missing;
  simMatchedSkills     = matched;
  simCurrentRole       = role;

  const roleData = ROLES[role];
  const TIER_FACTOR_S = (w) => w >= 4 ? 1.0 : w === 3 ? 1.0 : 0.6;
  simBaseTotalWeight   = roleData.skills.reduce((a, s) => a + s.weight * TIER_FACTOR_S(s.weight), 0);
  simBaseMatchedWeight = matched.reduce((a, s) => a + s.contribution, 0);

  const wrap = document.getElementById('skill-simulator');
  wrap.style.visibility = '';
  wrap.style.maxHeight = '';
  wrap.style.overflow = '';
  // Trigger reveal animation
  requestAnimationFrame(() => {
    wrap.classList.remove('visible');
    requestAnimationFrame(() => { wrap.classList.add('visible'); });
  });

  renderSimulator();
  simUpdateDisplay(baseScore, baseScore);
}

function renderSimulator() {
  /* Owned skills */
  document.getElementById('sim-owned-grid').innerHTML = simMatchedSkills.length === 0
    ? '<span style="font-size:12px;color:var(--text3);font-style:italic;">None yet — add your skills on the Setup page.</span>'
    : simMatchedSkills.map(s => `
        <span class="sim-owned-tag">
          ${s.name}
          <span style="font-family:'Montserrat',sans-serif;font-size:9px;opacity:0.6;margin-left:2px;">Lv${s.userLevel}</span>
        </span>`).join('');

  /* Sort missing skills by IMPACT SCORE = gain × weight × (1 + unlockScore×0.4) */
  const scored = simMissingSkills.map(s => {
    const gain    = simSkillGain(s);
    const unlock  = simUnlockScore(s.name, simMatchedSkills);
    const impact  = gain * (1 + unlock * 0.4);
    const deps    = SKILL_DEPS[s.name] || [];
    const ownedNames = new Set(simMatchedSkills.map(m => m.name));
    const missingDeps = deps.filter(d => !ownedNames.has(d) && !simLearnedSkills.has(d));
    return { ...s, gain, unlock, impact, missingDeps };
  }).sort((a, b) => b.impact - a.impact);

  const grid = document.getElementById('sim-skills-grid');
  grid.innerHTML = scored.map((s, rank) => {
    const key = simIdKey(s.name);
    const isLearned = simLearnedSkills.has(s.name);
    const tierLabel = s.weight >= 4 ? { label:'Critical', color:'var(--red)' }
                    : s.weight === 3 ? { label:'Supporting', color:'var(--yellow)' }
                    :                  { label:'Optional', color:'var(--text2)' };
    const gainPts = Math.round((s.gain / simBaseTotalWeight) * 100);
    const reason  = SKILL_REASONS[s.name] || `Important for the ${simCurrentRole} role.`;
    const depWarning = s.missingDeps.length > 0 && !isLearned
      ? `<div style="font-size:10px;color:var(--yellow);font-family:'Montserrat',sans-serif;margin-top:4px;">⚠ Needs: ${s.missingDeps.slice(0,2).join(', ')}</div>`
      : '';
    const unlockNote = s.unlock > 0
      ? `<span style="font-family:'Montserrat',sans-serif;font-size:9px;color:var(--accent2);background:rgba(44,95,212,0.12);padding:1px 5px;border-radius:8px;margin-left:4px;">unlocks ${s.unlock}</span>`
      : '';

    return `
      <div class="sim-skill-card ${isLearned ? 'learned' : ''} ${rank < 3 ? 'high-impact' : ''}"
           id="sim-card-${key}" onclick="simToggle('${s.name.replace(/'/g,"\'")}')">
        <div class="sim-toggle" id="sim-toggle-${key}">${isLearned ? '✓' : ''}</div>
        <div class="sim-skill-info" style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;">
            ${rank < 3 ? '<span style="font-family:Montserrat,sans-serif;font-size:9px;color:var(--accent2);background:rgba(44,95,212,0.15);padding:1px 5px;border-radius:8px;">Top Pick</span>' : ''}
            <span class="sim-skill-name" style="flex:1;">${s.name}</span>
            ${unlockNote}
          </div>
          <div class="sim-skill-meta">
            <span style="font-family:'Montserrat',sans-serif;font-size:10px;color:${tierLabel.color};background:${tierLabel.color}18;padding:1px 7px;border-radius:10px;border:1px solid ${tierLabel.color}33;">${tierLabel.label}</span>
            <span class="sim-gain-badge" style="opacity:1;">+${gainPts}pts</span>
          </div>
          <div style="font-size:11px;color:var(--text2);margin-top:5px;line-height:1.5;opacity:0.85;">${reason.length > 90 ? reason.slice(0,90)+'…' : reason}</div>
          ${depWarning}
        </div>
      </div>`;
  }).join('');

  /* Learning order recommendation */
  renderLearningOrder(scored);
}

function renderLearningOrder(scored) {
  const el = document.getElementById('sim-learning-order');
  if (!el) return;
  // Top 5 by impact, noting deps
  const top = scored.slice(0, 5);
  el.innerHTML = top.map((s, i) => {
    const gainPts = Math.round((s.gain / simBaseTotalWeight) * 100);
    const isLearned = simLearnedSkills.has(s.name);
    return `
      <div style="display:flex;align-items:flex-start;gap:10px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.05);">
        <div style="width:22px;height:22px;border-radius:50%;background:${isLearned?'var(--green)':'rgba(44,95,212,0.25)'};border:1.5px solid ${isLearned?'var(--green)':'rgba(44,95,212,0.5)'};display:flex;align-items:center;justify-content:center;font-family:'Montserrat',sans-serif;font-weight:800;font-size:11px;color:${isLearned?'white':'var(--accent2)'};flex-shrink:0;transition:all 0.3s;">${isLearned?'✓':(i+1)}</div>
        <div style="flex:1;">
          <div style="font-size:13px;font-weight:600;color:${isLearned?'var(--green)':'var(--text)'};text-decoration:${isLearned?'line-through':'none'};margin-bottom:2px;transition:all 0.3s;">${s.name}</div>
          <div style="font-family:'Montserrat',sans-serif;font-size:10px;color:var(--text2);">+${gainPts}pts to readiness${s.unlock>0?' · unlocks '+s.unlock+' more skill'+(s.unlock>1?'s':''):''}</div>
        </div>
      </div>`;
  }).join('');
}

function simIdKey(name) { return name.replace(/[^a-zA-Z0-9]/g,'_'); }

function simToggle(name) {
  if (simLearnedSkills.has(name)) {
    simLearnedSkills.delete(name);
  } else {
    simLearnedSkills.add(name);
  }
  renderSimulator();
  simRecalculate();
}

function simRecalculate() {
  const TIER_FACTOR_SIM = (w) => w >= 4 ? 1.0 : w === 3 ? 1.0 : 0.6;
  let bonusWeight = 0;
  let newMissingCritical = simMissingSkills.filter(s => s.weight >= 4).length;
  simLearnedSkills.forEach(name => {
    const s = simMissingSkills.find(m => m.name === name);
    if (s) {
      bonusWeight += s.weight * 0.65 * TIER_FACTOR_SIM(s.weight);
      if (s.weight >= 4) newMissingCritical--;
    }
  });
  const hasCritical = simMissingSkills.some(s => s.weight >= 4) || simMatchedSkills.some(s => s.weight >= 4);
  const critPenalty = newMissingCritical * 3;
  const critBonus   = (newMissingCritical === 0 && hasCritical) ? 8 : 0;
  const rawNew      = ((simBaseMatchedWeight + bonusWeight) / simBaseTotalWeight) * 100;
  const newScore    = Math.min(100, Math.max(0, Math.round(rawNew - critPenalty + critBonus)));

  simUpdateDisplay(newScore, simBaseScore);

  const impact = document.getElementById('sim-impact');
  const gained = newScore - simBaseScore;
  if (simLearnedSkills.size === 0) {
    impact.innerHTML = '<span style="color:var(--text2);">Select skills above — the engine ranks them by impact and shows your projected score.</span>';
    impact.className = 'sim-impact';
  } else {
    const sw = simLearnedSkills.size === 1 ? 'skill' : 'skills';
    if (gained >= 15) {
      impact.innerHTML = `Learning ${simLearnedSkills.size} ${sw} pushes you to ${newScore}% — a +${gained}pt jump. That moves you up a readiness tier.`;
      impact.className = 'sim-impact boosted';
    } else if (gained > 0) {
      impact.innerHTML = `${simLearnedSkills.size} ${sw} selected — projected readiness: ${newScore}% (+${gained}pts). Add the top-ranked missing skills for the biggest gains.`;
      impact.className = 'sim-impact';
    } else {
      impact.innerHTML = `These skills have minimal direct score impact here — focus on levelling up your existing skills instead.`;
      impact.className = 'sim-impact';
    }
  }
}

function simUpdateDisplay(newScore, baseScore) {
  const circ = 2 * Math.PI * 23;
  const si   = getScoreInfo(newScore);

  const ring = document.getElementById('sim-ring');
  ring.setAttribute('stroke', si.color);
  ring.setAttribute('stroke-dashoffset', circ - (newScore / 100) * circ);
  document.getElementById('sim-ring-num').textContent = newScore + '%';
  document.getElementById('sim-ring-num').style.color = si.color;

  const numEl = document.getElementById('sim-score-num');
  numEl.textContent = newScore + '%';
  numEl.style.color = si.color;

  const delta = document.getElementById('sim-delta');
  const diff  = newScore - baseScore;
  if (diff === 0) { delta.className = 'sim-score-delta'; delta.textContent = ''; }
  else {
    delta.className = 'sim-score-delta visible ' + (diff > 0 ? 'positive' : 'negative');
    delta.textContent = (diff > 0 ? '+' : '') + diff + ' pts';
  }

  const bar = document.getElementById('sim-bar');
  bar.style.width      = newScore + '%';
  bar.style.background = `linear-gradient(90deg, ${si.color}, ${si.color}99)`;

  document.getElementById('sim-bar-label-left').textContent  = 'Current: ' + baseScore + '%';
  document.getElementById('sim-bar-label-right').textContent = newScore > baseScore ? 'Projected: ' + newScore + '%' : '';
}

function simReset() {
  simLearnedSkills.clear();
  renderSimulator();
  simUpdateDisplay(simBaseScore, simBaseScore);
  const impact = document.getElementById('sim-impact');
  impact.innerHTML = '<span style="color:var(--text2);">Select skills above — the engine ranks them by impact and shows your projected score.</span>';
  impact.className = 'sim-impact';
}

/* ═══ ADVISOR ═══ */
function buildAdvisor(role, score, missing, matched) {
  const wrap = document.getElementById('advisor-wrap');
  const body = document.getElementById('advisor-body');
  if (!wrap || !body) return;
  wrap.style.visibility = '';
  wrap.style.maxHeight = '';
  wrap.style.overflow = '';
  wrap.style.padding = '';
  wrap.style.margin = '';
  requestAnimationFrame(() => {
    wrap.classList.remove('visible');
    requestAnimationFrame(() => { wrap.classList.add('visible'); });
  });

  const criticalMissing = missing.filter(s => s.weight >= 4).sort((a,b) => b.weight - a.weight);
  const topPriority = [...missing].sort((a,b) => b.weight - a.weight)[0];
  const beginnerSkills = matched.filter(s => s.userLevel === 1);

  // Summary
  const summary = score >= 85
    ? `Strong profile for <strong>${role}</strong> at ${score}% — you've covered what most hiring managers need to see.`
    : score >= 65
    ? `Solid foundation at ${score}%, but interviewers will probe the remaining gaps.`
    : score >= 40
    ? `At ${score}%, you're heading in the right direction but not yet competitive for most ${role} openings.`
    : `At ${score}%, you're early in the journey — that's fine, the path forward is clear.`;

  // Weakness
  const weakness = criticalMissing.length >= 2
    ? `Biggest gap: <strong>${criticalMissing.slice(0,2).map(s=>s.name).join('</strong> and <strong>')}</strong>${criticalMissing.length > 2 ? ` (+${criticalMissing.length-2} more critical skills)` : ''} — these are screened first.`
    : criticalMissing.length === 1
    ? `Key missing skill: <strong>${criticalMissing[0].name}</strong> — employers treat this as near-mandatory.`
    : beginnerSkills.length > matched.length / 2 && matched.length > 2
    ? `${beginnerSkills.length} skills at Beginner level — depth matters more than coverage at this stage.`
    : topPriority
    ? `Main gap: <strong>${topPriority.name}</strong> — without it many recruiters will screen you out early.`
    : `No critical gaps. Focus on polishing depth and portfolio quality.`;

  // Next step
  const nextstep = criticalMissing.length > 0
    ? `Build a project with <strong>${criticalMissing[0].name}</strong> — a live demo beats any certificate.`
    : beginnerSkills.length > 2
    ? `Level up <strong>${(beginnerSkills.find(s=>s.weight>=4)||beginnerSkills[0]).name}</strong> to Intermediate with one real, finished project.`
    : topPriority
    ? `Add <strong>${topPriority.name}</strong> to your portfolio this month — project first, tutorials second.`
    : `Polish your portfolio: live demos, clear READMEs, and documented decision-making.`;

  // Outlook
  const realistic = score >= 85
    ? `Start applying now — 3–5 apps per week. Don't wait for 100%, it never comes.`
    : score >= 65
    ? `Give it 6–8 weeks on your top gaps, then apply. Network in parallel.`
    : score >= 40
    ? `3–4 months of focused work puts you in a competitive position. Set a project milestone, not a date.`
    : `Use the next 3–5 months to build real skills. One shipped project outweighs five courses on any CV.`;

  body.innerHTML = [
    { cls:'summary',   icon:'', text: summary  },
    { cls:'weakness',  icon:'', text: weakness },
    { cls:'nextstep',  icon:'', text: nextstep  },
    { cls:'realistic', icon:'', text: realistic },
  ].map(s => `
    <div class="advisor-sentence ${s.cls}">
      ${s.text}
    </div>`).join('');
}

/* ═══ SCROLL REVEAL OBSERVER ═══ */
let revealObserver = null;

function initRevealObserver() {
  if (revealObserver) revealObserver.disconnect();
  revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });

  // Observe all .reveal elements in the results page
  document.querySelectorAll('.page.active .reveal').forEach(el => {
    el.classList.remove('visible');
    revealObserver.observe(el);
  });
}

function triggerRevealSequence() {
  const activePage = document.querySelector('.page.active');
  const allReveals = Array.from(document.querySelectorAll('.page.active .reveal'));
  const immediateCount = activePage?.id === 'page-analysis' ? 2 : 1;

  // Small stagger: top section fires immediately, rest on scroll.
  allReveals.slice(0, immediateCount).forEach((el, i) => {
    setTimeout(() => el.classList.add('visible'), i * 120);
  });
  // Rest observed on scroll
  initRevealObserver();
}

/* ═══ WHERE TO LEARN — CRITICAL SKILLS ═══ */
const LEARN_RESOURCES = {
  "SQL": [
    { name: "SQLZoo",          type: "Interactive", url: "https://sqlzoo.net" },
    { name: "Mode SQL Tutorial", type: "Guide",    url: "https://mode.com/sql-tutorial" },
    { name: "CS50 SQL",        type: "Course",     url: "https://cs50.harvard.edu/sql" },
  ],
  "Python": [
    { name: "Python.org Docs",     type: "Docs",       url: "https://docs.python.org/3/tutorial" },
    { name: "Automate the Boring Stuff", type: "Book", url: "https://automatetheboringstuff.com" },
    { name: "freeCodeCamp Python", type: "Course",     url: "https://www.freecodecamp.org/learn/scientific-computing-with-python" },
  ],
  "Statistics": [
    { name: "Khan Academy Stats",  type: "Course",  url: "https://www.khanacademy.org/math/statistics-probability" },
    { name: "StatQuest (YouTube)", type: "Video",   url: "https://www.youtube.com/@statquest" },
    { name: "Think Stats (free)",  type: "Book",    url: "https://greenteapress.com/wp/think-stats-2e" },
  ],
  "Data Cleaning": [
    { name: "Kaggle: Data Cleaning", type: "Course", url: "https://www.kaggle.com/learn/data-cleaning" },
    { name: "Pandas Docs",           type: "Docs",   url: "https://pandas.pydata.org/docs/user_guide" },
  ],
  "Data Visualization": [
    { name: "Kaggle: Data Viz",      type: "Course", url: "https://www.kaggle.com/learn/data-visualization" },
    { name: "D3.js Tutorials",       type: "Guide",  url: "https://d3js.org" },
    { name: "Storytelling with Data", type: "Book",  url: "https://www.storytellingwithdata.com" },
  ],
  "Excel / Google Sheets": [
    { name: "GCFGlobal Excel",      type: "Course",     url: "https://edu.gcfglobal.org/en/excel" },
    { name: "ExcelJet",             type: "Reference",  url: "https://exceljet.net" },
  ],
  "JavaScript": [
    { name: "javascript.info",      type: "Guide",   url: "https://javascript.info" },
    { name: "freeCodeCamp JS",      type: "Course",  url: "https://www.freecodecamp.org/learn/javascript-algorithms-and-data-structures" },
    { name: "Eloquent JavaScript",  type: "Book",    url: "https://eloquentjavascript.net" },
  ],
  "HTML & CSS": [
    { name: "MDN Web Docs",         type: "Docs",    url: "https://developer.mozilla.org/en-US/docs/Learn" },
    { name: "The Odin Project",     type: "Course",  url: "https://www.theodinproject.com" },
    { name: "freeCodeCamp HTML",    type: "Course",  url: "https://www.freecodecamp.org/learn/responsive-web-design" },
  ],
  "React": [
    { name: "react.dev (official)", type: "Docs",    url: "https://react.dev/learn" },
    { name: "Scrimba React Course", type: "Course",  url: "https://scrimba.com/learn/learnreact" },
  ],
  "TypeScript": [
    { name: "TypeScript Handbook",  type: "Docs",    url: "https://www.typescriptlang.org/docs/handbook" },
    { name: "Matt Pocock TS Tips",  type: "Video",   url: "https://www.youtube.com/@mattpocockuk" },
  ],
  "Responsive Design": [
    { name: "MDN Responsive Design", type: "Docs",  url: "https://developer.mozilla.org/en-US/docs/Learn/CSS/CSS_layout/Responsive_Design" },
    { name: "web.dev Learn CSS",     type: "Guide",  url: "https://web.dev/learn/css" },
  ],
  "Data Structures & Algorithms": [
    { name: "NeetCode",             type: "Practice", url: "https://neetcode.io" },
    { name: "CS50x",                type: "Course",   url: "https://cs50.harvard.edu/x" },
    { name: "Visualgo",             type: "Visual",   url: "https://visualgo.net" },
  ],
  "Object-Oriented Programming": [
    { name: "Refactoring.Guru",     type: "Guide",   url: "https://refactoring.guru/design-patterns" },
    { name: "CS50P Python OOP",     type: "Course",  url: "https://cs50.harvard.edu/python" },
  ],
  "Python / Java / C++": [
    { name: "The Odin Project",     type: "Course",  url: "https://www.theodinproject.com" },
    { name: "Codecademy",           type: "Course",  url: "https://www.codecademy.com" },
    { name: "Exercism",             type: "Practice", url: "https://exercism.org" },
  ],
  "REST APIs": [
    { name: "REST API Tutorial",    type: "Guide",   url: "https://restfulapi.net" },
    { name: "Postman Learning",     type: "Docs",    url: "https://learning.postman.com" },
  ],
  "System Design": [
    { name: "System Design Primer", type: "Guide",   url: "https://github.com/donnemartin/system-design-primer" },
    { name: "ByteByteGo",           type: "Video",   url: "https://www.youtube.com/@ByteByteGo" },
  ],
  "Python / Node.js / Java": [
    { name: "The Odin Project",     type: "Course",  url: "https://www.theodinproject.com" },
    { name: "Node.js Docs",         type: "Docs",    url: "https://nodejs.org/en/learn/getting-started/introduction-to-nodejs" },
  ],
  "Authentication & Security": [
    { name: "OWASP Top Ten",        type: "Guide",   url: "https://owasp.org/www-project-top-ten" },
    { name: "JWT.io",               type: "Docs",    url: "https://jwt.io/introduction" },
  ],
  "SQL Databases": [
    { name: "SQLZoo",               type: "Interactive", url: "https://sqlzoo.net" },
    { name: "PostgreSQL Tutorial",  type: "Guide",       url: "https://www.postgresqltutorial.com" },
  ],
  "Statistics & Probability": [
    { name: "Khan Academy Stats",   type: "Course",  url: "https://www.khanacademy.org/math/statistics-probability" },
    { name: "StatQuest (YouTube)",  type: "Video",   url: "https://www.youtube.com/@statquest" },
  ],
  "Linear Algebra": [
    { name: "3Blue1Brown Essence of Linear Algebra", type: "Video", url: "https://www.youtube.com/playlist?list=PLZHQObOWTQDPD3MizzM2xVFitgF8hE_ab" },
    { name: "MIT OCW 18.06",        type: "Course",  url: "https://ocw.mit.edu/courses/18-06-linear-algebra-spring-2010" },
  ],
  "Scikit-learn": [
    { name: "Scikit-learn Docs",    type: "Docs",    url: "https://scikit-learn.org/stable/getting_started.html" },
    { name: "Kaggle ML Course",     type: "Course",  url: "https://www.kaggle.com/learn/intro-to-machine-learning" },
  ],
  "Deep Learning (PyTorch/TF)": [
    { name: "fast.ai",              type: "Course",  url: "https://course.fast.ai" },
    { name: "PyTorch Docs",         type: "Docs",    url: "https://pytorch.org/tutorials" },
    { name: "Deep Learning Specialization", type: "Course", url: "https://www.coursera.org/specializations/deep-learning" },
  ],
  "Feature Engineering": [
    { name: "Kaggle Feature Engineering", type: "Course", url: "https://www.kaggle.com/learn/feature-engineering" },
  ],
  "Model Evaluation": [
    { name: "Scikit-learn Model Evaluation", type: "Docs", url: "https://scikit-learn.org/stable/modules/model_evaluation.html" },
  ],
  "C++ / C#": [
    { name: "learncpp.com",         type: "Guide",   url: "https://www.learncpp.com" },
    { name: "Microsoft C# Docs",    type: "Docs",    url: "https://learn.microsoft.com/en-us/dotnet/csharp" },
  ],
  "Unity / Unreal Engine": [
    { name: "Unity Learn",          type: "Course",  url: "https://learn.unity.com" },
    { name: "Unreal Online Learning", type: "Course", url: "https://dev.epicgames.com/community/learning" },
    { name: "Brackeys (YouTube)",   type: "Video",   url: "https://www.youtube.com/@Brackeys" },
  ],
  "Game Design Principles": [
    { name: "Game Design Concepts (free)", type: "Course", url: "https://gamedesignconcepts.wordpress.com" },
    { name: "GDC Vault (free talks)", type: "Video", url: "https://gdcvault.com/free" },
  ],
  "Linear Algebra & Maths": [
    { name: "3Blue1Brown Essence of Linear Algebra", type: "Video", url: "https://www.youtube.com/playlist?list=PLZHQObOWTQDPD3MizzM2xVFitgF8hE_ab" },
    { name: "Khan Academy",         type: "Course",  url: "https://www.khanacademy.org/math/linear-algebra" },
  ],
  "Performance Optimisation": [
    { name: "Unity Optimization Tips", type: "Docs",  url: "https://docs.unity3d.com/Manual/BestPracticeUnderstandingPerformanceInUnity.html" },
    { name: "Catlike Coding",          type: "Guide", url: "https://catlikecoding.com" },
  ],
  "Linux / Shell Scripting": [
    { name: "The Linux Command Line (free)", type: "Book",   url: "https://linuxcommand.org/tlcl.php" },
    { name: "OverTheWire: Bandit",           type: "Practice", url: "https://overthewire.org/wargames/bandit" },
  ],
  "Docker / Kubernetes": [
    { name: "Docker Getting Started",  type: "Docs",    url: "https://docs.docker.com/get-started" },
    { name: "KubeByExample",           type: "Guide",   url: "https://kubebyexample.com" },
    { name: "TechWorld with Nana",     type: "Video",   url: "https://www.youtube.com/@TechWorldwithNana" },
  ],
  "CI/CD (Jenkins/GitHub Actions)": [
    { name: "GitHub Actions Docs",   type: "Docs",    url: "https://docs.github.com/en/actions" },
    { name: "DevOps Bootcamp (Nana)", type: "Video",  url: "https://www.youtube.com/@TechWorldwithNana" },
  ],
  "Cloud Platforms (AWS/GCP/Azure)": [
    { name: "AWS Skill Builder (free)", type: "Course", url: "https://skillbuilder.aws" },
    { name: "Google Cloud Skills Boost", type: "Course", url: "https://cloudskillsboost.google" },
    { name: "Microsoft Learn Azure",    type: "Course", url: "https://learn.microsoft.com/en-us/training/azure" },
  ],
  "Infrastructure as Code (Terraform)": [
    { name: "Terraform Tutorials",  type: "Docs",    url: "https://developer.hashicorp.com/terraform/tutorials" },
  ],
  "Infrastructure as Code (Terraform/CDK)": [
    { name: "Terraform Tutorials",  type: "Docs",    url: "https://developer.hashicorp.com/terraform/tutorials" },
    { name: "AWS CDK Workshop",     type: "Guide",   url: "https://cdkworkshop.com" },
  ],
  "Network Security": [
    { name: "CompTIA Security+ Study", type: "Guide",  url: "https://www.professormesser.com/security-plus/sy0-701/sy0-701-video/sy0-701-comptia-security-study-course" },
    { name: "TryHackMe",               type: "Practice", url: "https://tryhackme.com" },
  ],
  "Threat Detection & Analysis": [
    { name: "TryHackMe SOC Path",   type: "Practice", url: "https://tryhackme.com/paths" },
    { name: "Cyber Defenders",      type: "Practice", url: "https://cyberdefenders.org" },
  ],
  "Vulnerability Assessment": [
    { name: "TryHackMe",            type: "Practice", url: "https://tryhackme.com" },
    { name: "HackTheBox",           type: "Practice", url: "https://www.hackthebox.com" },
  ],
  "Incident Response": [
    { name: "NIST SP 800-61",       type: "Guide",   url: "https://csrc.nist.gov/publications/detail/sp/800-61/rev-2/final" },
    { name: "TryHackMe IR Rooms",   type: "Practice", url: "https://tryhackme.com" },
  ],
  "Linux / Windows Administration": [
    { name: "The Linux Command Line (free)", type: "Book", url: "https://linuxcommand.org/tlcl.php" },
    { name: "TryHackMe Linux Fundamentals", type: "Course", url: "https://tryhackme.com/module/linux-fundamentals" },
  ],
  "AWS / Azure / GCP (Advanced)": [
    { name: "AWS Skill Builder",     type: "Course",  url: "https://skillbuilder.aws" },
    { name: "A Cloud Guru",          type: "Course",  url: "https://acloudguru.com" },
  ],
  "Cloud Architecture Design": [
    { name: "AWS Well-Architected",  type: "Guide",   url: "https://aws.amazon.com/architecture/well-architected" },
    { name: "Google Cloud Architecture Center", type: "Guide", url: "https://cloud.google.com/architecture" },
  ],
  "Networking (VPC, DNS, Load Balancing)": [
    { name: "AWS Networking Fundamentals", type: "Video", url: "https://www.youtube.com/watch?v=hiKPPy584Mg" },
    { name: "Networking Fundamentals (Practical)", type: "Video", url: "https://www.youtube.com/@PracticalNetworking" },
  ],
  "Security & IAM": [
    { name: "AWS IAM Docs",          type: "Docs",    url: "https://docs.aws.amazon.com/IAM/latest/UserGuide" },
    { name: "OWASP Top Ten",         type: "Guide",   url: "https://owasp.org/www-project-top-ten" },
  ],
  "Kubernetes / Container Orchestration": [
    { name: "Kubernetes Docs",       type: "Docs",    url: "https://kubernetes.io/docs/tutorials" },
    { name: "KodeKloud",             type: "Course",  url: "https://kodekloud.com" },
  ],
  "Cost Optimisation": [
    { name: "AWS Cost Optimization Hub", type: "Docs", url: "https://aws.amazon.com/aws-cost-management/aws-cost-optimization" },
  ],
  "LLM APIs (OpenAI / Anthropic / Gemini)": [
    { name: "OpenAI Docs",           type: "Docs",    url: "https://platform.openai.com/docs" },
    { name: "Anthropic Docs",        type: "Docs",    url: "https://docs.anthropic.com" },
    { name: "DeepLearning.AI Short Courses", type: "Course", url: "https://www.deeplearning.ai/short-courses" },
  ],
  "Prompt Engineering": [
    { name: "Anthropic Prompt Engineering Guide", type: "Docs", url: "https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/overview" },
    { name: "DeepLearning.AI: ChatGPT Prompt Engineering", type: "Course", url: "https://www.deeplearning.ai/short-courses/chatgpt-prompt-engineering-for-developers" },
  ],
  "RAG (Retrieval-Augmented Generation)": [
    { name: "DeepLearning.AI: Building RAG", type: "Course", url: "https://www.deeplearning.ai/short-courses/building-and-evaluating-advanced-rag" },
    { name: "LangChain RAG Docs",    type: "Docs",    url: "https://python.langchain.com/docs/tutorials/rag" },
  ],
  "LangChain / LlamaIndex": [
    { name: "LangChain Docs",        type: "Docs",    url: "https://python.langchain.com/docs/introduction" },
    { name: "LlamaIndex Docs",       type: "Docs",    url: "https://docs.llamaindex.ai" },
  ],
  "Vector Databases (Pinecone / Chroma)": [
    { name: "Pinecone Learning Center", type: "Guide", url: "https://www.pinecone.io/learn" },
    { name: "Chroma Docs",           type: "Docs",    url: "https://docs.trychroma.com" },
  ],
  "REST APIs / FastAPI": [
    { name: "FastAPI Docs",          type: "Docs",    url: "https://fastapi.tiangolo.com" },
    { name: "RESTful API Tutorial",  type: "Guide",   url: "https://restfulapi.net" },
  ],
  "Evaluation & Testing of LLMs": [
    { name: "DeepLearning.AI: Evaluating LLMs", type: "Course", url: "https://www.deeplearning.ai/short-courses/evaluating-debugging-generative-ai" },
  ],
  "Manual Testing": [
    { name: "ISTQB Foundation Syllabus", type: "Guide", url: "https://www.istqb.org/certifications/certified-tester-foundation-level" },
    { name: "Guru99 Software Testing",   type: "Guide", url: "https://www.guru99.com/software-testing.html" },
  ],
  "Test Case Writing": [
    { name: "Guru99 Test Case Guide",    type: "Guide", url: "https://www.guru99.com/test-case.html" },
  ],
  "Selenium / Playwright": [
    { name: "Playwright Docs",       type: "Docs",    url: "https://playwright.dev/docs/intro" },
    { name: "Selenium Docs",         type: "Docs",    url: "https://www.selenium.dev/documentation" },
  ],
  "API Testing (Postman)": [
    { name: "Postman Learning Center", type: "Docs",  url: "https://learning.postman.com/docs/introduction/overview" },
  ],
  "Bug Reporting & Tracking (Jira)": [
    { name: "Atlassian Jira Training", type: "Course", url: "https://training.atlassian.com/free-training-catalog" },
  ],
};

/* ═══ LEARN DATA (Learn + Certs + Test) ═══ */
const LEARN_DATA = {
  "SQL": {
    learn: [
      { name: "SQLZoo — interactive exercises",        type: "Interactive", url: "https://sqlzoo.net" },
      { name: "Mode SQL Tutorial",                     type: "Guide",       url: "https://mode.com/sql-tutorial" },
      { name: "CS50 SQL (Harvard, free)",              type: "Course",      url: "https://cs50.harvard.edu/sql" },
    ],
    certs: [
      { name: "Google Data Analytics Certificate",    type: "Cert", url: "https://grow.google/certificates/data-analytics" },
      { name: "IBM SQL for Data Science (Coursera)",  type: "Cert", url: "https://www.coursera.org/learn/sql-for-data-science" },
    ],
    test: [
      { name: "HackerRank SQL Challenges",            type: "Test",    url: "https://www.hackerrank.com/domains/sql" },
      { name: "LeetCode Database Problems",           type: "Practice", url: "https://leetcode.com/problemset/database" },
    ],
  },
  "Python": {
    learn: [
      { name: "Automate the Boring Stuff (free)",     type: "Book",    url: "https://automatetheboringstuff.com" },
      { name: "CS50P — Python (Harvard, free)",       type: "Course",  url: "https://cs50.harvard.edu/python" },
      { name: "freeCodeCamp Scientific Python",       type: "Course",  url: "https://www.freecodecamp.org/learn/scientific-computing-with-python" },
    ],
    certs: [
      { name: "PCEP — Certified Entry-Level Python",  type: "Cert", url: "https://pythoninstitute.org/pcep" },
      { name: "Google IT Automation with Python",     type: "Cert", url: "https://grow.google/certificates/it-automation-python" },
    ],
    test: [
      { name: "HackerRank Python Challenges",         type: "Test",    url: "https://www.hackerrank.com/domains/python" },
      { name: "Exercism Python Track",                type: "Practice", url: "https://exercism.org/tracks/python" },
    ],
  },
  "Statistics": {
    learn: [
      { name: "Khan Academy — Statistics & Probability", type: "Course", url: "https://www.khanacademy.org/math/statistics-probability" },
      { name: "StatQuest with Josh Starmer (YouTube)",   type: "Video",  url: "https://www.youtube.com/@statquest" },
      { name: "Think Stats 2e (free book)",              type: "Book",   url: "https://greenteapress.com/wp/think-stats-2e" },
    ],
    certs: [
      { name: "IBM Statistics for Data Science (Coursera)", type: "Cert", url: "https://www.coursera.org/learn/statistics-for-data-science-python" },
    ],
    test: [
      { name: "Khan Academy practice exercises",      type: "Test", url: "https://www.khanacademy.org/math/statistics-probability" },
    ],
  },
  "Data Cleaning": {
    learn: [
      { name: "Kaggle: Data Cleaning Course",         type: "Course",  url: "https://www.kaggle.com/learn/data-cleaning" },
      { name: "Pandas Official Docs",                 type: "Docs",    url: "https://pandas.pydata.org/docs/user_guide" },
    ],
    certs: [
      { name: "Kaggle Data Cleaning Certificate",     type: "Cert", url: "https://www.kaggle.com/learn/data-cleaning" },
    ],
    test: [
      { name: "Kaggle Notebooks — practice datasets", type: "Practice", url: "https://www.kaggle.com/datasets" },
    ],
  },
  "Data Visualization": {
    learn: [
      { name: "Kaggle: Data Visualization Course",    type: "Course", url: "https://www.kaggle.com/learn/data-visualization" },
      { name: "Storytelling with Data (book)",        type: "Book",   url: "https://www.storytellingwithdata.com" },
    ],
    certs: [
      { name: "Tableau Desktop Specialist",           type: "Cert", url: "https://www.tableau.com/learn/certification/desktop-specialist" },
      { name: "Power BI Data Analyst (PL-300)",       type: "Cert", url: "https://learn.microsoft.com/en-us/certifications/power-bi-data-analyst-associate" },
    ],
    test: [
      { name: "Tableau Public — build & share",       type: "Practice", url: "https://public.tableau.com" },
    ],
  },
  "Excel / Google Sheets": {
    learn: [
      { name: "GCFGlobal Excel Training (free)",      type: "Course",    url: "https://edu.gcfglobal.org/en/excel" },
      { name: "ExcelJet — formula reference",         type: "Reference", url: "https://exceljet.net" },
    ],
    certs: [
      { name: "Microsoft Office Specialist: Excel",   type: "Cert", url: "https://learn.microsoft.com/en-us/certifications/mos-excel-2019" },
    ],
    test: [
      { name: "Excel practice exercises — Excel Easy", type: "Practice", url: "https://www.excel-easy.com/examples.html" },
    ],
  },
  "JavaScript": {
    learn: [
      { name: "javascript.info — modern JS guide",    type: "Guide",  url: "https://javascript.info" },
      { name: "Eloquent JavaScript (free book)",      type: "Book",   url: "https://eloquentjavascript.net" },
      { name: "freeCodeCamp JS Algorithms",           type: "Course", url: "https://www.freecodecamp.org/learn/javascript-algorithms-and-data-structures" },
    ],
    certs: [
      { name: "freeCodeCamp JS Certification",        type: "Cert", url: "https://www.freecodecamp.org/learn/javascript-algorithms-and-data-structures" },
    ],
    test: [
      { name: "HackerRank JS Challenges",             type: "Test",    url: "https://www.hackerrank.com/domains/tutorials/10-days-of-javascript" },
      { name: "Exercism JavaScript Track",            type: "Practice", url: "https://exercism.org/tracks/javascript" },
    ],
  },
  "HTML & CSS": {
    learn: [
      { name: "MDN Learn Web Development",            type: "Docs",   url: "https://developer.mozilla.org/en-US/docs/Learn" },
      { name: "The Odin Project",                     type: "Course", url: "https://www.theodinproject.com" },
      { name: "web.dev Learn CSS",                    type: "Guide",  url: "https://web.dev/learn/css" },
    ],
    certs: [
      { name: "freeCodeCamp Responsive Web Design",   type: "Cert", url: "https://www.freecodecamp.org/learn/2022/responsive-web-design" },
    ],
    test: [
      { name: "Frontend Mentor — real projects",      type: "Practice", url: "https://www.frontendmentor.io" },
      { name: "CSS Challenges — CSS Battle",          type: "Test",     url: "https://cssbattle.dev" },
    ],
  },
  "React": {
    learn: [
      { name: "react.dev — official tutorial",        type: "Docs",   url: "https://react.dev/learn" },
      { name: "Scrimba React Course",                 type: "Course", url: "https://scrimba.com/learn/learnreact" },
    ],
    certs: [
      { name: "Meta Front-End Developer Certificate", type: "Cert", url: "https://www.coursera.org/professional-certificates/meta-front-end-developer" },
    ],
    test: [
      { name: "Frontend Mentor — React challenges",   type: "Practice", url: "https://www.frontendmentor.io" },
    ],
  },
  "TypeScript": {
    learn: [
      { name: "TypeScript Handbook (official)",       type: "Docs",  url: "https://www.typescriptlang.org/docs/handbook" },
      { name: "Total TypeScript by Matt Pocock",      type: "Video", url: "https://www.totaltypescript.com" },
    ],
    certs: [
      { name: "TypeScript Fundamentals (LinkedIn Learning)", type: "Cert", url: "https://www.linkedin.com/learning/typescript-essential-training-14687057" },
    ],
    test: [
      { name: "TypeScript Exercises",                 type: "Practice", url: "https://typescript-exercises.github.io" },
    ],
  },
  "Responsive Design": {
    learn: [
      { name: "MDN Responsive Design Guide",          type: "Docs",   url: "https://developer.mozilla.org/en-US/docs/Learn/CSS/CSS_layout/Responsive_Design" },
      { name: "web.dev Responsive Web",               type: "Guide",  url: "https://web.dev/responsive-web-design-basics" },
    ],
    certs: [
      { name: "freeCodeCamp Responsive Web Design",   type: "Cert", url: "https://www.freecodecamp.org/learn/2022/responsive-web-design" },
    ],
    test: [
      { name: "Frontend Mentor — layout challenges",  type: "Practice", url: "https://www.frontendmentor.io/challenges?types=free&difficulties=1" },
    ],
  },
  "Data Structures & Algorithms": {
    learn: [
      { name: "NeetCode — structured roadmap",        type: "Guide",  url: "https://neetcode.io/roadmap" },
      { name: "CS50x (Harvard, free)",                type: "Course", url: "https://cs50.harvard.edu/x" },
      { name: "Visualgo — visual DS&A",               type: "Visual", url: "https://visualgo.net" },
    ],
    certs: [
      { name: "Google Coding Challenges Prep",        type: "Cert", url: "https://grow.google/certificates/data-analytics" },
      { name: "HackerRank Problem Solving Certificate", type: "Cert", url: "https://www.hackerrank.com/skills-verification/problem_solving_basic" },
    ],
    test: [
      { name: "LeetCode — interview problems",        type: "Practice", url: "https://leetcode.com" },
      { name: "HackerRank Problem Solving",           type: "Test",     url: "https://www.hackerrank.com/domains/algorithms" },
    ],
  },
  "Object-Oriented Programming": {
    learn: [
      { name: "Refactoring.Guru — design patterns",   type: "Guide",  url: "https://refactoring.guru/design-patterns" },
      { name: "CS50P (Harvard Python + OOP)",         type: "Course", url: "https://cs50.harvard.edu/python" },
    ],
    certs: [
      { name: "Oracle Java SE Foundations",           type: "Cert", url: "https://education.oracle.com/java-se-8-foundations" },
    ],
    test: [
      { name: "Exercism OOP challenges",              type: "Practice", url: "https://exercism.org" },
    ],
  },
  "Python / Java / C++": {
    learn: [
      { name: "The Odin Project",                     type: "Course", url: "https://www.theodinproject.com" },
      { name: "Codecademy language courses",          type: "Course", url: "https://www.codecademy.com" },
    ],
    certs: [
      { name: "Oracle Java SE Programmer",            type: "Cert", url: "https://education.oracle.com/java-se-11-programmer-i" },
      { name: "PCEP — Python Certified Entry",        type: "Cert", url: "https://pythoninstitute.org/pcep" },
    ],
    test: [
      { name: "Exercism — language tracks",           type: "Practice", url: "https://exercism.org" },
      { name: "HackerRank 30 Days of Code",           type: "Practice", url: "https://www.hackerrank.com/domains/tutorials/30-days-of-code" },
    ],
  },
  "REST APIs": {
    learn: [
      { name: "RESTful API Tutorial",                 type: "Guide", url: "https://restfulapi.net" },
      { name: "Postman Learning Center",              type: "Docs",  url: "https://learning.postman.com" },
    ],
    certs: [
      { name: "Postman API Fundamentals Student Expert", type: "Cert", url: "https://academy.postman.com/postman-api-fundamentals-student-expert-certification-1" },
    ],
    test: [
      { name: "Postman — public API practice",        type: "Practice", url: "https://www.postman.com/explore" },
    ],
  },
  "System Design": {
    learn: [
      { name: "System Design Primer (GitHub)",        type: "Guide", url: "https://github.com/donnemartin/system-design-primer" },
      { name: "ByteByteGo (YouTube)",                 type: "Video", url: "https://www.youtube.com/@ByteByteGo" },
    ],
    certs: [
      { name: "AWS Solutions Architect Associate",    type: "Cert", url: "https://aws.amazon.com/certification/certified-solutions-architect-associate" },
    ],
    test: [
      { name: "Pramp — system design mock interviews", type: "Practice", url: "https://www.pramp.com" },
    ],
  },
  "Python / Node.js / Java": {
    learn: [
      { name: "Node.js Official Learn Guide",         type: "Docs",   url: "https://nodejs.org/en/learn/getting-started/introduction-to-nodejs" },
      { name: "The Odin Project — Node path",         type: "Course", url: "https://www.theodinproject.com/paths/full-stack-javascript" },
    ],
    certs: [
      { name: "OpenJS Node.js Application Developer", type: "Cert", url: "https://training.linuxfoundation.org/certification/jsnad" },
    ],
    test: [
      { name: "HackerRank Node.js",                   type: "Test", url: "https://www.hackerrank.com/skills-verification/node_js" },
    ],
  },
  "Authentication & Security": {
    learn: [
      { name: "OWASP Top Ten",                        type: "Guide", url: "https://owasp.org/www-project-top-ten" },
      { name: "JWT.io Introduction",                  type: "Docs",  url: "https://jwt.io/introduction" },
    ],
    certs: [
      { name: "CompTIA Security+",                    type: "Cert", url: "https://www.comptia.org/certifications/security" },
    ],
    test: [
      { name: "TryHackMe — web security rooms",       type: "Practice", url: "https://tryhackme.com/hacktivities?tab=practice" },
    ],
  },
  "SQL Databases": {
    learn: [
      { name: "PostgreSQL Tutorial",                  type: "Guide",       url: "https://www.postgresqltutorial.com" },
      { name: "SQLZoo — interactive",                 type: "Interactive", url: "https://sqlzoo.net" },
    ],
    certs: [
      { name: "Oracle Database SQL Certified Associate", type: "Cert", url: "https://education.oracle.com/oracle-database-sql-certified-associate" },
    ],
    test: [
      { name: "LeetCode Database Problems",           type: "Practice", url: "https://leetcode.com/problemset/database" },
    ],
  },
  "Statistics & Probability": {
    learn: [
      { name: "Khan Academy Stats",                   type: "Course", url: "https://www.khanacademy.org/math/statistics-probability" },
      { name: "StatQuest (YouTube)",                  type: "Video",  url: "https://www.youtube.com/@statquest" },
    ],
    certs: [
      { name: "IBM Statistics for Data Science",      type: "Cert", url: "https://www.coursera.org/learn/statistics-for-data-science-python" },
    ],
    test: [
      { name: "Khan Academy exercises",               type: "Test", url: "https://www.khanacademy.org/math/statistics-probability" },
    ],
  },
  "Linear Algebra": {
    learn: [
      { name: "3Blue1Brown — Essence of Linear Algebra", type: "Video", url: "https://www.youtube.com/playlist?list=PLZHQObOWTQDPD3MizzM2xVFitgF8hE_ab" },
      { name: "MIT 18.06 Linear Algebra (OCW)",          type: "Course", url: "https://ocw.mit.edu/courses/18-06-linear-algebra-spring-2010" },
    ],
    certs: [
      { name: "Mathematics for ML Specialization",    type: "Cert", url: "https://www.coursera.org/specializations/mathematics-machine-learning" },
    ],
    test: [
      { name: "MIT OpenCourseWare problem sets",      type: "Practice", url: "https://ocw.mit.edu/courses/18-06-linear-algebra-spring-2010/pages/assignments" },
    ],
  },
  "Scikit-learn": {
    learn: [
      { name: "Scikit-learn — Getting Started",       type: "Docs",   url: "https://scikit-learn.org/stable/getting_started.html" },
      { name: "Kaggle Intro to Machine Learning",     type: "Course", url: "https://www.kaggle.com/learn/intro-to-machine-learning" },
    ],
    certs: [
      { name: "Kaggle ML Certificate",                type: "Cert", url: "https://www.kaggle.com/learn/intro-to-machine-learning" },
    ],
    test: [
      { name: "Kaggle competitions — tabular data",   type: "Practice", url: "https://www.kaggle.com/competitions?listOption=active&hostSegmentIdFilter=5" },
    ],
  },
  "Deep Learning (PyTorch/TF)": {
    learn: [
      { name: "fast.ai Practical Deep Learning",      type: "Course", url: "https://course.fast.ai" },
      { name: "PyTorch Official Tutorials",           type: "Docs",   url: "https://pytorch.org/tutorials" },
      { name: "Deep Learning Specialization (Coursera)", type: "Course", url: "https://www.coursera.org/specializations/deep-learning" },
    ],
    certs: [
      { name: "TensorFlow Developer Certificate",     type: "Cert", url: "https://www.tensorflow.org/certificate" },
      { name: "Deep Learning Specialization Cert",    type: "Cert", url: "https://www.coursera.org/specializations/deep-learning" },
    ],
    test: [
      { name: "Kaggle competitions — deep learning",  type: "Practice", url: "https://www.kaggle.com/competitions" },
    ],
  },
  "Feature Engineering": {
    learn: [
      { name: "Kaggle Feature Engineering Course",    type: "Course", url: "https://www.kaggle.com/learn/feature-engineering" },
    ],
    certs: [
      { name: "Kaggle Feature Engineering Certificate", type: "Cert", url: "https://www.kaggle.com/learn/feature-engineering" },
    ],
    test: [
      { name: "Kaggle practice datasets",             type: "Practice", url: "https://www.kaggle.com/datasets" },
    ],
  },
  "Model Evaluation": {
    learn: [
      { name: "Scikit-learn: Model Evaluation",       type: "Docs",   url: "https://scikit-learn.org/stable/modules/model_evaluation.html" },
      { name: "Kaggle Intermediate ML",               type: "Course", url: "https://www.kaggle.com/learn/intermediate-machine-learning" },
    ],
    certs: [
      { name: "Kaggle Intermediate ML Certificate",   type: "Cert", url: "https://www.kaggle.com/learn/intermediate-machine-learning" },
    ],
    test: [
      { name: "Kaggle competitions — scored metrics",  type: "Practice", url: "https://www.kaggle.com/competitions" },
    ],
  },
  "C++ / C#": {
    learn: [
      { name: "learncpp.com",                         type: "Guide",  url: "https://www.learncpp.com" },
      { name: "Microsoft C# Documentation",           type: "Docs",   url: "https://learn.microsoft.com/en-us/dotnet/csharp" },
    ],
    certs: [
      { name: "Microsoft Certified: .NET Fundamentals", type: "Cert", url: "https://learn.microsoft.com/en-us/certifications/dotnet-fundamentals" },
    ],
    test: [
      { name: "HackerRank C++ Challenges",            type: "Test",    url: "https://www.hackerrank.com/domains/cpp" },
      { name: "Exercism C# Track",                    type: "Practice", url: "https://exercism.org/tracks/csharp" },
    ],
  },
  "Unity / Unreal Engine": {
    learn: [
      { name: "Unity Learn (official)",               type: "Course", url: "https://learn.unity.com" },
      { name: "Unreal Online Learning",               type: "Course", url: "https://dev.epicgames.com/community/learning" },
      { name: "Brackeys — Unity YouTube",             type: "Video",  url: "https://www.youtube.com/@Brackeys" },
    ],
    certs: [
      { name: "Unity Certified User: Programmer",     type: "Cert", url: "https://unity.com/products/unity-certifications/user-programmer" },
      { name: "Unreal Authorized Instructor Training", type: "Cert", url: "https://dev.epicgames.com/community/learning/courses" },
    ],
    test: [
      { name: "Unity Microgames — build & submit",    type: "Practice", url: "https://learn.unity.com/project/unity-micro-game" },
    ],
  },
  "Game Design Principles": {
    learn: [
      { name: "Game Design Concepts (free course)",   type: "Course", url: "https://gamedesignconcepts.wordpress.com" },
      { name: "GDC Vault — free talks",               type: "Video",  url: "https://gdcvault.com/free" },
    ],
    certs: [
      { name: "CalArts Game Design Specialization",   type: "Cert", url: "https://www.coursera.org/specializations/game-design" },
    ],
    test: [
      { name: "Game Jam — itch.io",                   type: "Practice", url: "https://itch.io/jams" },
    ],
  },
  "Linear Algebra & Maths": {
    learn: [
      { name: "3Blue1Brown Linear Algebra",           type: "Video", url: "https://www.youtube.com/playlist?list=PLZHQObOWTQDPD3MizzM2xVFitgF8hE_ab" },
      { name: "Khan Academy Linear Algebra",          type: "Course", url: "https://www.khanacademy.org/math/linear-algebra" },
    ],
    certs: [
      { name: "Mathematics for Machine Learning",     type: "Cert", url: "https://www.coursera.org/specializations/mathematics-machine-learning" },
    ],
    test: [
      { name: "Khan Academy exercises",               type: "Test", url: "https://www.khanacademy.org/math/linear-algebra" },
    ],
  },
  "Performance Optimisation": {
    learn: [
      { name: "Unity Optimization Best Practices",    type: "Docs", url: "https://docs.unity3d.com/Manual/BestPracticeUnderstandingPerformanceInUnity.html" },
      { name: "Catlike Coding Tutorials",             type: "Guide", url: "https://catlikecoding.com" },
    ],
    certs: [
      { name: "Unity Certified Expert: Programmer",   type: "Cert", url: "https://unity.com/products/unity-certifications/expert-programmer" },
    ],
    test: [
      { name: "Unity Profiler — profile your own project", type: "Practice", url: "https://docs.unity3d.com/Manual/Profiler.html" },
    ],
  },
  "Linux / Shell Scripting": {
    learn: [
      { name: "The Linux Command Line (free book)",   type: "Book",    url: "https://linuxcommand.org/tlcl.php" },
      { name: "OverTheWire: Bandit — wargame",        type: "Practice", url: "https://overthewire.org/wargames/bandit" },
    ],
    certs: [
      { name: "Linux Foundation Certified SysAdmin",  type: "Cert", url: "https://training.linuxfoundation.org/certification/lfcs" },
      { name: "CompTIA Linux+",                       type: "Cert", url: "https://www.comptia.org/certifications/linux" },
    ],
    test: [
      { name: "OverTheWire Bandit challenges",        type: "Practice", url: "https://overthewire.org/wargames/bandit" },
      { name: "HackerRank Linux Shell",               type: "Test",     url: "https://www.hackerrank.com/domains/shell" },
    ],
  },
  "Docker / Kubernetes": {
    learn: [
      { name: "Docker Getting Started",               type: "Docs",   url: "https://docs.docker.com/get-started" },
      { name: "Kubernetes Official Tutorials",        type: "Docs",   url: "https://kubernetes.io/docs/tutorials" },
      { name: "TechWorld with Nana (YouTube)",        type: "Video",  url: "https://www.youtube.com/@TechWorldwithNana" },
    ],
    certs: [
      { name: "Certified Kubernetes Administrator (CKA)", type: "Cert", url: "https://training.linuxfoundation.org/certification/certified-kubernetes-administrator-cka" },
      { name: "Docker Certified Associate",           type: "Cert", url: "https://training.mirantis.com/certification/dca-certification-exam" },
    ],
    test: [
      { name: "KillerCoda — K8s scenarios",           type: "Practice", url: "https://killercoda.com" },
      { name: "Play with Docker",                     type: "Practice", url: "https://labs.play-with-docker.com" },
    ],
  },
  "CI/CD (Jenkins/GitHub Actions)": {
    learn: [
      { name: "GitHub Actions Docs",                  type: "Docs",   url: "https://docs.github.com/en/actions" },
      { name: "DevOps Bootcamp with Nana",            type: "Video",  url: "https://www.youtube.com/@TechWorldwithNana" },
    ],
    certs: [
      { name: "GitHub Actions Certification",         type: "Cert", url: "https://examregistration.github.com/certification/ACTIONS" },
      { name: "Jenkins Certified Engineer",           type: "Cert", url: "https://www.cloudbees.com/jenkins/certification" },
    ],
    test: [
      { name: "GitHub Actions — build your own workflow", type: "Practice", url: "https://github.com/skills/hello-github-actions" },
    ],
  },
  "Cloud Platforms (AWS/GCP/Azure)": {
    learn: [
      { name: "AWS Skill Builder (free tier)",        type: "Course", url: "https://skillbuilder.aws" },
      { name: "Google Cloud Skills Boost",            type: "Course", url: "https://cloudskillsboost.google" },
      { name: "Microsoft Learn Azure",                type: "Course", url: "https://learn.microsoft.com/en-us/training/azure" },
    ],
    certs: [
      { name: "AWS Certified Cloud Practitioner",     type: "Cert", url: "https://aws.amazon.com/certification/certified-cloud-practitioner" },
      { name: "Google Associate Cloud Engineer",      type: "Cert", url: "https://cloud.google.com/learn/certification/cloud-engineer" },
      { name: "AZ-900 Azure Fundamentals",            type: "Cert", url: "https://learn.microsoft.com/en-us/certifications/azure-fundamentals" },
    ],
    test: [
      { name: "AWS Free Tier — hands-on labs",        type: "Practice", url: "https://aws.amazon.com/free" },
      { name: "A Cloud Guru Sandbox Environments",    type: "Practice", url: "https://acloudguru.com/platform/cloud-sandbox-playgrounds" },
    ],
  },
  "Infrastructure as Code (Terraform)": {
    learn: [
      { name: "Terraform Official Tutorials",         type: "Docs",   url: "https://developer.hashicorp.com/terraform/tutorials" },
    ],
    certs: [
      { name: "HashiCorp Certified: Terraform Associate", type: "Cert", url: "https://www.hashicorp.com/certification/terraform-associate" },
    ],
    test: [
      { name: "Terraform Up & Running exercises",     type: "Practice", url: "https://www.terraformupandrunning.com" },
    ],
  },
  "Infrastructure as Code (Terraform/CDK)": {
    learn: [
      { name: "Terraform Official Tutorials",         type: "Docs",  url: "https://developer.hashicorp.com/terraform/tutorials" },
      { name: "AWS CDK Workshop",                     type: "Guide", url: "https://cdkworkshop.com" },
    ],
    certs: [
      { name: "HashiCorp Terraform Associate",        type: "Cert", url: "https://www.hashicorp.com/certification/terraform-associate" },
      { name: "AWS Solutions Architect Associate",    type: "Cert", url: "https://aws.amazon.com/certification/certified-solutions-architect-associate" },
    ],
    test: [
      { name: "Terraform Playground on Instruqt",     type: "Practice", url: "https://play.instruqt.com/hashicorp" },
    ],
  },
  "Network Security": {
    learn: [
      { name: "Professor Messer Security+ Study",     type: "Course",  url: "https://www.professormesser.com/security-plus/sy0-701/sy0-701-video/sy0-701-comptia-security-study-course" },
      { name: "TryHackMe Network Security path",      type: "Practice", url: "https://tryhackme.com/paths" },
    ],
    certs: [
      { name: "CompTIA Security+",                    type: "Cert", url: "https://www.comptia.org/certifications/security" },
      { name: "CompTIA Network+",                     type: "Cert", url: "https://www.comptia.org/certifications/network" },
    ],
    test: [
      { name: "TryHackMe — network rooms",            type: "Practice", url: "https://tryhackme.com/hacktivities?tab=practice" },
      { name: "Hack The Box — network challenges",    type: "Practice", url: "https://www.hackthebox.com" },
    ],
  },
  "Threat Detection & Analysis": {
    learn: [
      { name: "TryHackMe SOC Level 1 Path",           type: "Course",  url: "https://tryhackme.com/path/outline/soclevel1" },
      { name: "Cyber Defenders Labs",                 type: "Practice", url: "https://cyberdefenders.org" },
    ],
    certs: [
      { name: "CompTIA CySA+",                        type: "Cert", url: "https://www.comptia.org/certifications/cybersecurity-analyst" },
      { name: "BTL1 — Blue Team Labs One",            type: "Cert", url: "https://www.securityblue.team/btl1" },
    ],
    test: [
      { name: "Cyber Defenders — PCAP challenges",    type: "Practice", url: "https://cyberdefenders.org/blueteam-ctf-challenges" },
    ],
  },
  "Vulnerability Assessment": {
    learn: [
      { name: "TryHackMe — vulnerability research",   type: "Practice", url: "https://tryhackme.com" },
      { name: "Hack The Box — starting point",        type: "Practice", url: "https://www.hackthebox.com/starting-point" },
    ],
    certs: [
      { name: "CEH — Certified Ethical Hacker",       type: "Cert", url: "https://www.eccouncil.org/programs/certified-ethical-hacker-ceh" },
      { name: "CompTIA PenTest+",                     type: "Cert", url: "https://www.comptia.org/certifications/pentest" },
    ],
    test: [
      { name: "HackTheBox — OWASP practice",          type: "Practice", url: "https://www.hackthebox.com" },
      { name: "DVWA — Damn Vulnerable Web App",       type: "Practice", url: "https://dvwa.co.uk" },
    ],
  },
  "Incident Response": {
    learn: [
      { name: "NIST SP 800-61 Rev 2 (free guide)",    type: "Guide",   url: "https://csrc.nist.gov/publications/detail/sp/800-61/rev-2/final" },
      { name: "TryHackMe IR & Forensics rooms",       type: "Practice", url: "https://tryhackme.com" },
    ],
    certs: [
      { name: "GCIH — GIAC Incident Handler",         type: "Cert", url: "https://www.giac.org/certifications/certified-incident-handler-gcih" },
      { name: "BTL1 — Blue Team Labs One",            type: "Cert", url: "https://www.securityblue.team/btl1" },
    ],
    test: [
      { name: "Cyber Defenders — IR labs",            type: "Practice", url: "https://cyberdefenders.org" },
    ],
  },
  "Linux / Windows Administration": {
    learn: [
      { name: "The Linux Command Line (free book)",   type: "Book",    url: "https://linuxcommand.org/tlcl.php" },
      { name: "TryHackMe Linux Fundamentals",         type: "Course",  url: "https://tryhackme.com/module/linux-fundamentals" },
    ],
    certs: [
      { name: "CompTIA Linux+",                       type: "Cert", url: "https://www.comptia.org/certifications/linux" },
      { name: "LFCS — Linux Foundation Sysadmin",     type: "Cert", url: "https://training.linuxfoundation.org/certification/lfcs" },
    ],
    test: [
      { name: "OverTheWire Bandit challenges",        type: "Practice", url: "https://overthewire.org/wargames/bandit" },
    ],
  },
  "AWS / Azure / GCP (Advanced)": {
    learn: [
      { name: "AWS Skill Builder",                    type: "Course", url: "https://skillbuilder.aws" },
      { name: "A Cloud Guru",                         type: "Course", url: "https://acloudguru.com" },
    ],
    certs: [
      { name: "AWS Solutions Architect Professional", type: "Cert", url: "https://aws.amazon.com/certification/certified-solutions-architect-professional" },
      { name: "Google Professional Cloud Architect",  type: "Cert", url: "https://cloud.google.com/learn/certification/cloud-architect" },
      { name: "AZ-305 Azure Solutions Architect",     type: "Cert", url: "https://learn.microsoft.com/en-us/certifications/azure-solutions-architect" },
    ],
    test: [
      { name: "AWS Well-Architected Labs",            type: "Practice", url: "https://wellarchitectedlabs.com" },
    ],
  },
  "Cloud Architecture Design": {
    learn: [
      { name: "AWS Well-Architected Framework",       type: "Guide", url: "https://aws.amazon.com/architecture/well-architected" },
      { name: "Google Cloud Architecture Center",     type: "Guide", url: "https://cloud.google.com/architecture" },
    ],
    certs: [
      { name: "AWS Solutions Architect Associate",    type: "Cert", url: "https://aws.amazon.com/certification/certified-solutions-architect-associate" },
    ],
    test: [
      { name: "AWS Architecture — reference labs",    type: "Practice", url: "https://aws.amazon.com/architecture" },
    ],
  },
  "Kubernetes / Container Orchestration": {
    learn: [
      { name: "Kubernetes Official Tutorials",        type: "Docs",   url: "https://kubernetes.io/docs/tutorials" },
      { name: "KodeKloud K8s Courses",                type: "Course", url: "https://kodekloud.com" },
    ],
    certs: [
      { name: "CKA — Certified Kubernetes Administrator", type: "Cert", url: "https://training.linuxfoundation.org/certification/certified-kubernetes-administrator-cka" },
      { name: "CKAD — Kubernetes Application Developer", type: "Cert", url: "https://training.linuxfoundation.org/certification/certified-kubernetes-application-developer-ckad" },
    ],
    test: [
      { name: "KillerCoda — K8s interactive labs",    type: "Practice", url: "https://killercoda.com/killer-shell-ckad" },
    ],
  },
  "Security & IAM": {
    learn: [
      { name: "AWS IAM User Guide",                   type: "Docs",  url: "https://docs.aws.amazon.com/IAM/latest/UserGuide" },
      { name: "OWASP Top Ten",                        type: "Guide", url: "https://owasp.org/www-project-top-ten" },
    ],
    certs: [
      { name: "AWS Security Specialty",               type: "Cert", url: "https://aws.amazon.com/certification/certified-security-specialty" },
      { name: "CompTIA Security+",                    type: "Cert", url: "https://www.comptia.org/certifications/security" },
    ],
    test: [
      { name: "TryHackMe Cloud Security rooms",       type: "Practice", url: "https://tryhackme.com" },
    ],
  },
  "LLM APIs (OpenAI / Anthropic / Gemini)": {
    learn: [
      { name: "OpenAI API Docs",                      type: "Docs",   url: "https://platform.openai.com/docs" },
      { name: "Anthropic API Docs",                   type: "Docs",   url: "https://docs.anthropic.com" },
      { name: "DeepLearning.AI Short Courses",        type: "Course", url: "https://www.deeplearning.ai/short-courses" },
    ],
    certs: [
      { name: "DeepLearning.AI — LLMOps Certificate", type: "Cert", url: "https://www.deeplearning.ai/short-courses/llmops" },
    ],
    test: [
      { name: "OpenAI Playground — experiment",       type: "Practice", url: "https://platform.openai.com/playground" },
    ],
  },
  "Prompt Engineering": {
    learn: [
      { name: "Anthropic Prompt Engineering Guide",   type: "Docs",   url: "https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/overview" },
      { name: "DeepLearning.AI: Prompt Engineering",  type: "Course", url: "https://www.deeplearning.ai/short-courses/chatgpt-prompt-engineering-for-developers" },
    ],
    certs: [
      { name: "DeepLearning.AI Prompt Engineering Cert", type: "Cert", url: "https://www.deeplearning.ai/short-courses/chatgpt-prompt-engineering-for-developers" },
    ],
    test: [
      { name: "PromptingGuide — practice exercises",  type: "Practice", url: "https://www.promptingguide.ai" },
    ],
  },
  "RAG (Retrieval-Augmented Generation)": {
    learn: [
      { name: "DeepLearning.AI — Building RAG",       type: "Course", url: "https://www.deeplearning.ai/short-courses/building-and-evaluating-advanced-rag" },
      { name: "LangChain RAG Tutorial",               type: "Docs",   url: "https://python.langchain.com/docs/tutorials/rag" },
    ],
    certs: [
      { name: "DeepLearning.AI RAG Certificate",      type: "Cert", url: "https://www.deeplearning.ai/short-courses/building-and-evaluating-advanced-rag" },
    ],
    test: [
      { name: "Build a RAG app — deploy to HuggingFace", type: "Practice", url: "https://huggingface.co/spaces" },
    ],
  },
  "LangChain / LlamaIndex": {
    learn: [
      { name: "LangChain Documentation",             type: "Docs",   url: "https://python.langchain.com/docs/introduction" },
      { name: "LlamaIndex Documentation",             type: "Docs",   url: "https://docs.llamaindex.ai" },
    ],
    certs: [
      { name: "DeepLearning.AI LangChain Course",     type: "Cert", url: "https://www.deeplearning.ai/short-courses/langchain-for-llm-application-development" },
    ],
    test: [
      { name: "LangSmith — trace and test chains",    type: "Practice", url: "https://www.langchain.com/langsmith" },
    ],
  },
  "Selenium / Playwright": {
    learn: [
      { name: "Playwright Official Docs",             type: "Docs", url: "https://playwright.dev/docs/intro" },
      { name: "Selenium Official Docs",               type: "Docs", url: "https://www.selenium.dev/documentation" },
    ],
    certs: [
      { name: "ISTQB Test Automation Engineer",       type: "Cert", url: "https://www.istqb.org/certifications/test-automation-engineer" },
    ],
    test: [
      { name: "Playwright Test Generator — record UI", type: "Practice", url: "https://playwright.dev/docs/codegen" },
    ],
  },
  "Manual Testing": {
    learn: [
      { name: "Guru99 Software Testing Guide",        type: "Guide", url: "https://www.guru99.com/software-testing.html" },
      { name: "ISTQB Foundation Syllabus",            type: "Guide", url: "https://www.istqb.org/certifications/certified-tester-foundation-level" },
    ],
    certs: [
      { name: "ISTQB Foundation Level (CTFL)",        type: "Cert", url: "https://www.istqb.org/certifications/certified-tester-foundation-level" },
    ],
    test: [
      { name: "The-Internet — practice test site",    type: "Practice", url: "https://the-internet.herokuapp.com" },
    ],
  },
  "Test Case Writing": {
    learn: [
      { name: "Guru99 — How to Write Test Cases",     type: "Guide", url: "https://www.guru99.com/test-case.html" },
    ],
    certs: [
      { name: "ISTQB CTFL",                           type: "Cert", url: "https://www.istqb.org/certifications/certified-tester-foundation-level" },
    ],
    test: [
      { name: "Practice on open-source projects",     type: "Practice", url: "https://github.com/explore" },
    ],
  },
  "API Testing (Postman)": {
    learn: [
      { name: "Postman Learning Center",              type: "Docs", url: "https://learning.postman.com/docs/introduction/overview" },
    ],
    certs: [
      { name: "Postman API Fundamentals Student Expert", type: "Cert", url: "https://academy.postman.com/postman-api-fundamentals-student-expert-certification-1" },
    ],
    test: [
      { name: "Postman Public APIs — explore",        type: "Practice", url: "https://www.postman.com/explore" },
    ],
  },
  "Bug Reporting & Tracking (Jira)": {
    learn: [
      { name: "Atlassian Jira Free Training",         type: "Course", url: "https://training.atlassian.com/free-training-catalog" },
    ],
    certs: [
      { name: "Atlassian Certified Jira Administrator", type: "Cert", url: "https://www.atlassian.com/university/certification" },
    ],
    test: [
      { name: "Jira Software free tier — practice",   type: "Practice", url: "https://www.atlassian.com/software/jira/free" },
    ],
  },
};

function buildLearnResources(missing) {
  const section = document.getElementById('learn-resources-section');
  const list    = document.getElementById('learn-resources-list');
  if (!section || !list) return;

  const critical = missing.filter(s => s.weight >= 4);
  if (critical.length === 0) {
    section.style.visibility = 'hidden';
    section.style.maxHeight = '0';
    section.style.overflow = 'hidden';
    section.style.padding = '0';
    section.style.border = 'none';
    section.style.margin = '0';
    return;
  }
  // Show and trigger reveal animation
  section.style.visibility = '';
  section.style.maxHeight = '';
  section.style.overflow = '';
  section.style.padding = '';
  section.style.border = '';
  section.style.marginBottom = '32px';
  section.style.marginTop = '0';
  // Re-trigger scroll reveal for this element
  requestAnimationFrame(() => {
    section.classList.remove('visible');
    requestAnimationFrame(() => {
      const rect = section.getBoundingClientRect();
      const inView = rect.top < window.innerHeight - 40;
      if (inView) {
        section.classList.add('visible');
      } else if (revealObserver) {
        revealObserver.observe(section);
      } else {
        section.classList.add('visible');
      }
    });
  });

  // Badge style helpers
  const BADGE_STYLES = {
    Course:       { bg: 'rgba(44,95,212,0.2)',   text: '#6699ff' },
    Docs:         { bg: 'rgba(40,201,144,0.15)',  text: '#28c990' },
    Guide:        { bg: 'rgba(232,184,75,0.15)',  text: '#e8b84b' },
    Video:        { bg: 'rgba(224,80,96,0.15)',   text: '#e05060' },
    Book:         { bg: 'rgba(160,130,255,0.15)', text: '#a78bfa' },
    Interactive:  { bg: 'rgba(44,95,212,0.2)',    text: '#6699ff' },
    Practice:     { bg: 'rgba(251,146,60,0.15)',  text: '#fb923c' },
    Cert:         { bg: 'rgba(232,184,75,0.18)',  text: '#e8b84b' },
    Test:         { bg: 'rgba(40,201,144,0.15)',  text: '#28c990' },
  };

  function linkHTML(r) {
    const s = BADGE_STYLES[r.type] || { bg: 'rgba(100,150,255,0.1)', text: 'var(--text2)' };
    return `<a class="learn-link" href="${r.url}" target="_blank" rel="noopener">
      <span class="learn-link-badge" style="background:${s.bg};color:${s.text};">${r.type}</span>
      <span class="learn-link-name">${r.name}</span>
      <span class="learn-link-arrow">→</span>
    </a>`;
  }

  function rowHTML(label, items) {
    if (!items || items.length === 0) return '';
    return `<div>
      <div class="learn-row-label">${label}</div>
      <div class="learn-links">${items.map(linkHTML).join('')}</div>
    </div>`;
  }

  list.innerHTML = `<div class="learn-skills-grid">${critical.map(s => {
    const data = LEARN_DATA[s.name] || {
      learn: [
        { name: 'freeCodeCamp — ' + s.name, type: 'Course', url: 'https://www.freecodecamp.org/news/search/?query=' + encodeURIComponent(s.name) },
        { name: 'YouTube tutorials',         type: 'Video',  url: 'https://www.youtube.com/results?search_query=' + encodeURIComponent(s.name + ' tutorial') },
      ],
      certs: [],
      test:  [{ name: 'HackerRank — ' + s.name, type: 'Test', url: 'https://www.hackerrank.com/skills-verification' }],
    };
    return `<div class="learn-skill-card">
      <div class="learn-skill-header">
        <div class="learn-skill-name">${s.name}</div>
        <span class="learn-skill-tier">Critical</span>
      </div>
      ${rowHTML('Learn', data.learn)}
      ${rowHTML('Certifications', data.certs)}
      ${rowHTML('Test your skills', data.test)}
    </div>`;
  }).join('')}</div>`;
}





