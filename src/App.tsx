import { type FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { ApiError, api } from './lib/api'
import { LocaleContext, type Language, type Translate, translate, translateError, useLocale } from './lib/i18n'
import { parseCardFile, parseWordList } from './lib/wordlist'

type User = { id: string; name: string; email: string; canImportCards: boolean }
type Folder = { id: string; name: string; color: string; createdAt: string }
type Flashcard = { id: string; folderId: string | null; front: string; back: string; studyMode: StudyMode; tags: string[]; createdAt: string }
type Screen = 'home' | 'folder' | 'study' | 'admin-import'
type StudyMode = 'pair' | 'guess' | 'recall' | 'type'

const colors = ['#dce9d7', '#f8dfcf', '#dce4f6', '#f4e8bd', '#eadcf0', '#d5ece8']

function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, React.ReactNode> = {
    home: <><path d="m3 10 9-7 9 7" /><path d="M5 9v11h14V9M9 20v-6h6v6" /></>,
    menu: <><path d="M4 6h16M4 12h16M4 18h16" /></>,
    folder: <><path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H10l2 2h7.5A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    search: <><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4 4" /></>,
    chevron: <path d="m9 18 6-6-6-6" />,
    back: <><path d="m15 18-6-6 6-6" /><path d="M9 12h11" /></>,
    cards: <><rect x="3" y="5" width="14" height="14" rx="2" /><path d="M7 3h12a2 2 0 0 1 2 2v12" /></>,
    upload: <><path d="M12 16V4m-4 4 4-4 4 4" /><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" /></>,
    play: <path d="m8 5 12 7-12 7z" />,
    close: <><path d="m18 6-12 12M6 6l12 12" /></>,
    trash: <><path d="M4 7h16M10 11v6m4-6v6M5 7l1 14h12l1-14M9 7V4h6v3" /></>,
    edit: <><path d="m15 5 4 4M4 20l4-.8L19 8a2.1 2.1 0 0 0-3-3L5 16z" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    shuffle: <><path d="m18 14 4 4-4 4M18 2l4 4-4 4M2 18h2.5a5 5 0 0 0 4-2l7-10a5 5 0 0 1 4-2H22M2 6h2.5a5 5 0 0 1 4 2l1.5 2M14 14l1.5 2a5 5 0 0 0 4 2H22" /></>,
    logout: <><path d="M10 17l5-5-5-5M15 12H3" /><path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6" /></>,
    sparkles: <><path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /><path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" /></>,
    book: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v17H6.5A2.5 2.5 0 0 0 4 22z" /><path d="M4 5v14a2 2 0 0 0 2 2h14M8 7h8M8 11h7" /></>,
    moon: <path d="M20 15.1A9 9 0 0 1 8.9 4a9 9 0 1 0 11.1 11.1z" />,
    sun: <><circle cx="12" cy="12" r="3.5" /><path d="M12 2v2.2M12 19.8V22M2 12h2.2M19.8 12H22M4.9 4.9l1.6 1.6M17.5 17.5l1.6 1.6M19.1 4.9l-1.6 1.6M6.5 17.5l-1.6 1.6" /></>,
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] ?? paths.cards}</svg>
}

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('')
}

function App() {
  const [language, setLanguage] = useState<Language>(() => localStorage.getItem('cardly-language') === 'mn' ? 'mn' : 'en')
  const t = useMemo<Translate>(() => (key, values) => translate(language, key, values), [language])
  const locale = useMemo(() => ({ language, setLanguage, t }), [language, t])

  useEffect(() => {
    document.documentElement.lang = language
    document.title = t('pageTitle')
    localStorage.setItem('cardly-language', language)
  }, [language, t])

  return <LocaleContext.Provider value={locale}><AppContent /></LocaleContext.Provider>
}

function AppContent() {
  const { t } = useLocale()
  const [user, setUser] = useState<User | null>(null)
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('cardly-theme')
    if (saved === 'light' || saved === 'dark') return saved
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })
  const [authChecked, setAuthChecked] = useState(false)
  const [folders, setFolders] = useState<Folder[]>([])
  const [cards, setCards] = useState<Flashcard[]>([])
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null)
  const [selectedStudyMode, setSelectedStudyMode] = useState<StudyMode | null>(null)
  const [screen, setScreen] = useState<Screen>('home')
  const [modal, setModal] = useState<'folder' | 'card' | 'import' | null>(null)
  const [editingCard, setEditingCard] = useState<Flashcard | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [startupError, setStartupError] = useState(false)

  const loadData = async () => {
    const [nextFolders, nextCards] = await Promise.all([api<Folder[]>('/folders'), api<Flashcard[]>('/cards')])
    setFolders(nextFolders)
    setCards(nextCards)
  }

  useEffect(() => {
    api<User>('/auth/me')
      .then(async (currentUser) => {
        setUser(currentUser)
        const [nextFolders, nextCards] = await Promise.all([api<Folder[]>('/folders'), api<Flashcard[]>('/cards')])
        setFolders(nextFolders)
        setCards(nextCards)
      })
      .catch((requestError) => {
        setUser(null)
        if (!(requestError instanceof ApiError && requestError.status === 401)) {
          setStartupError(true)
        }
      })
      .finally(() => setAuthChecked(true))
  }, [])

  useEffect(() => {
    if (!notice) return
    const timeout = window.setTimeout(() => setNotice(''), 2800)
    return () => window.clearTimeout(timeout)
  }, [notice])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('cardly-theme', theme)
  }, [theme])

  const currentFolder = folders.find((folder) => folder.id === selectedFolder) ?? null
  const visibleCards = useMemo(() => {
    const folderCards = selectedFolder ? cards.filter((card) => card.folderId === selectedFolder) : cards
    const normalized = query.trim().toLowerCase()
    return normalized ? folderCards.filter((card) => `${card.front} ${card.back}`.toLowerCase().includes(normalized)) : folderCards
  }, [cards, query, selectedFolder])

  const enterFolder = (id: string | null) => {
    setSelectedFolder(id)
    setScreen(id ? 'folder' : 'home')
    setQuery('')
    setProfileOpen(false)
    setSidebarOpen(false)
  }

  const refresh = async (message?: string) => {
    await loadData()
    if (message) setNotice(message)
  }

  const signOut = async () => {
    try {
      await api('/auth/logout', { method: 'POST' })
      setUser(null)
      setFolders([])
      setCards([])
      setScreen('home')
      setSelectedFolder(null)
    } catch (requestError) {
      setError(translateError(requestError, t, 'couldNotSignOut'))
    }
  }

  const removeFolder = async () => {
    if (!currentFolder || !window.confirm(t('deleteFolderConfirm', { name: currentFolder.name }))) return
    try {
      await api(`/folders/${currentFolder.id}`, { method: 'DELETE' })
      setSelectedFolder(null)
      setScreen('home')
      await refresh(t('folderDeleted'))
    } catch (requestError) {
      setError(translateError(requestError, t, 'couldNotDeleteFolder'))
    }
  }

  if (!authChecked) {
    return <main className="loading-screen"><div className="brand-mark">c</div><span className="loading-dot" /></main>
  }
  if (!user) {
    return <AuthScreen theme={theme} onThemeChange={setTheme} initialError={startupError ? t('apiUnavailable') : ''} onAuthenticated={async (authenticatedUser) => {
      setUser(authenticatedUser)
      setStartupError(false)
      try {
        await loadData()
      } catch {
        setError(t('accountReadyLoadFailed'))
      }
    }} />
  }

  return (
    <div className="app-shell">
      {sidebarOpen && <button className="scrim" onClick={() => setSidebarOpen(false)} aria-label={t('closeNavigation')} />}
      <aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <div className="brand"><div className="brand-mark">c</div><span>cardly</span><button className="icon-button mobile-close" onClick={() => setSidebarOpen(false)} aria-label={t('closeMenu')}><Icon name="close" /></button></div>
        <div className="side-label">{t('yourSpace')}</div>
        <nav className="main-nav" aria-label={t('mainNavigation')}>
          <button className={`nav-item ${screen === 'home' && !selectedFolder ? 'active' : ''}`} onClick={() => enterFolder(null)}><Icon name="home" /><span>{t('overview')}</span></button>
          <button className={`nav-item ${screen === 'study' ? 'active' : ''}`} onClick={() => { setSelectedFolder(null); setSelectedStudyMode(null); setScreen('study'); setSidebarOpen(false) }}><Icon name="cards" /><span>{t('studyAllCards')}</span>{cards.length > 0 && <span className="nav-count">{cards.length}</span>}</button>
          {user.canImportCards && <button className={`nav-item ${screen === 'admin-import' ? 'active' : ''}`} onClick={() => { setScreen('admin-import'); setSidebarOpen(false) }}><Icon name="upload" /><span>{t('adminImportNavigation')}</span></button>}
        </nav>
        <div className="folder-heading"><span className="side-label">{t('yourFolders')}</span><button className="tiny-add" onClick={() => setModal('folder')} aria-label={t('createFolder')}><Icon name="plus" size={17} /></button></div>
        <nav className="folder-nav" aria-label={t('folders')}>
          {folders.map((folder) => (
            <button key={folder.id} className={`nav-item folder-nav-item ${selectedFolder === folder.id ? 'active' : ''}`} onClick={() => enterFolder(folder.id)}>
              <span className="folder-dot" style={{ backgroundColor: folder.color }} /><span className="folder-nav-name">{folder.name}</span><span className="nav-count">{cards.filter((card) => card.folderId === folder.id).length}</span>
            </button>
          ))}
          {folders.length === 0 && <p className="sidebar-empty">{t('foldersShowHere')}</p>}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-tip"><div className="tip-icon"><Icon name="sparkles" size={18} /></div><p><strong>{t('aLittleEveryDay')}</strong><br />{t('knowledgeSticks')}</p></div>
          <div className="profile-row"><div className="avatar">{initials(user.name)}</div><div className="profile-copy"><strong>{user.name}</strong><span>{t('personalWorkspace')}</span></div><button className="icon-button signout-button" onClick={signOut} aria-label={t('signOut')} title={t('signOut')}><Icon name="logout" size={18} /></button></div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <button className="icon-button mobile-menu" onClick={() => setSidebarOpen(true)} aria-label={t('openMenu')}><Icon name="menu" size={20} /></button>
          <div className="breadcrumb"><span>{t('myLibrary')}</span>{currentFolder && <><Icon name="chevron" size={15} /><strong>{currentFolder.name}</strong></>}</div>
          <div className="topbar-right">
            <button className="icon-button theme-toggle" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label={t(theme === 'dark' ? 'switchToLight' : 'switchToDark')} title={t(theme === 'dark' ? 'switchToLight' : 'switchToDark')}>
              <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={18} />
            </button>
            <LanguageSelect />
            <div className="top-avatar">{initials(user.name)}</div>
          </div>
        </header>

        <div className="content">
          {screen === 'admin-import' ? (
            <AdminCardImport onComplete={(result) => {
              setNotice(t(result.delivery === 'pending' ? 'recipientCardsQueued' : 'recipientCardsAdded', { count: result.count }))
              setScreen('home')
            }} />
          ) : screen === 'study' ? (
            <StudyView cards={selectedFolder ? cards.filter((card) => card.folderId === selectedFolder) : cards} folderName={currentFolder?.name ?? t('allCards')} initialMode={selectedStudyMode} onExit={() => { setSelectedStudyMode(null); setScreen(currentFolder ? 'folder' : 'home') }} />
          ) : screen === 'folder' && currentFolder ? (
            <section>
              <div className="folder-hero">
                <div className="folder-kicker"><span className="folder-dot large" style={{ backgroundColor: currentFolder.color }} />{t('folder')}</div>
                <h1>{currentFolder.name}</h1>
                <p>{t('cardsHelpStick', { count: cards.filter((card) => card.folderId === currentFolder.id).length })}</p>
                <div className="folder-hero-actions">
                  <button className="button button-dark" onClick={() => { setSelectedStudyMode(null); setScreen('study') }} disabled={!visibleCards.length}><Icon name="play" size={17} />{t('studyFolder')}</button>
                  <button className="button button-light" onClick={() => { setEditingCard(null); setModal('card') }}><Icon name="plus" size={17} />{t('addCard')}</button>
                  <button className="button button-light" onClick={() => setModal('import')}><Icon name="upload" size={17} />{t('addFromList')}</button>
                  <button className="button button-light folder-manage" onClick={() => setModal('folder')}><Icon name="edit" size={16} />{t('editFolder')}</button>
                  <button className="icon-button folder-delete" onClick={removeFolder} aria-label={t('deleteFolder')} title={t('deleteFolder')}><Icon name="trash" size={17} /></button>
                </div>
              </div>
              <CardList cards={visibleCards} search={query} setSearch={setQuery} onEdit={(card) => { setEditingCard(card); setModal('card') }} onDelete={async (card) => {
                if (!window.confirm(t('deleteCardConfirm', { front: card.front }))) return
                try {
                  await api(`/cards/${card.id}`, { method: 'DELETE' })
                  await refresh(t('cardDeleted'))
                } catch (requestError) {
                  setError(translateError(requestError, t, 'couldNotDeleteCard'))
                }
              }} />
            </section>
          ) : (
            <section>
              <div className="welcome-row">
                <div><p className="eyebrow">{greeting(t)}, {user.name.split(' ')[0]} <span className="wave">✦</span></p><h1>{t('makeItLead')} <em>{t('makeItFinish')}</em></h1><p className="welcome-subtitle">{t('aFewGoodCards')}</p></div>
                <div className="streak-note"><span className="streak-flower">✳</span><span>{t('smallSteps')}<br /><strong>{t('bigRecall')}</strong></span></div>
              </div>

              <div className="overview-actions">
                <button className="button button-dark" onClick={() => { setSelectedStudyMode(null); setScreen('study') }} disabled={!cards.length}><Icon name="play" size={17} />{t('startStudying')}<span className="button-hint">{t('cardCount', { count: cards.length })}</span></button>
                <button className="button button-light" onClick={() => setModal('folder')}><Icon name="plus" size={17} />{t('newFolder')}</button>
                <button className="button button-light" onClick={() => { setEditingCard(null); setModal('card') }}><Icon name="cards" size={17} />{t('newCard')}</button>
              </div>

              <div className="section-title-row practice-title"><div><p className="eyebrow">{t('choosePractice')}</p><h2>{t('makeItStickYourWay')}</h2></div></div>
              <div className="practice-grid">{studyModes.map((studyMode) => {
                const hasAnswers = cards.filter((card) => card.back.trim())
                const uniqueAnswers = new Set(hasAnswers.map((card) => normalizeAnswer(card.back)))
                const available = studyMode.id === 'recall' ? cards.length > 0 : studyMode.id === 'pair' ? hasAnswers.length >= 2 : studyMode.id === 'guess' ? uniqueAnswers.size >= 2 : hasAnswers.length > 0
                return <button key={studyMode.id} className={`practice-card practice-${studyMode.id}`} disabled={!available} onClick={() => { setSelectedFolder(null); setSelectedStudyMode(studyMode.id); setScreen('study') }}>
                  <span className="practice-icon"><Icon name={studyMode.icon} size={19} /></span><span className="practice-copy"><strong>{t(studyMode.titleKey)}</strong><span>{t(studyMode.descriptionKey)}</span></span><Icon name="chevron" size={16} />
                </button>
              })}</div>

              <div className="section-title-row"><div><p className="eyebrow">{t('yourCollection')}</p><h2>{t('yourFoldersTitle')} <span className="muted-count">{folders.length}</span></h2></div><button className="text-button" onClick={() => setModal('folder')}><Icon name="plus" size={16} />{t('createFolder')}</button></div>
              {folders.length ? <div className="folder-grid">{folders.map((folder, index) => {
                const count = cards.filter((card) => card.folderId === folder.id).length
                return <button key={folder.id} className={`folder-card folder-card-${index % 4}`} onClick={() => enterFolder(folder.id)}>
                  <div className="folder-card-top"><span className="folder-illustration" style={{ backgroundColor: folder.color }}><Icon name="folder" size={23} /></span><Icon name="chevron" size={18} /></div>
                  <span className="folder-card-name">{folder.name}</span><span className="folder-card-count">{t('cardCount', { count })}</span>
                  <div className="folder-card-progress"><span style={{ width: `${Math.min(count * 12, 100)}%`, backgroundColor: folder.color }} /></div>
                </button>
              })}</div> : <div className="empty-panel"><div className="empty-art"><Icon name="folder" size={30} /></div><h3>{t('emptyFolderTitle')}</h3><p>{t('emptyFolderText')}</p><button className="button button-dark" onClick={() => setModal('folder')}><Icon name="plus" size={17} />{t('createAFolder')}</button></div>}

              <div className="section-title-row recent-heading"><div><p className="eyebrow">{t('keepItMoving')}</p><h2>{t('recentCards')} <span className="muted-count">{cards.length}</span></h2></div>{cards.length > 0 && <button className="text-button" onClick={() => setScreen('study')}>{t('studyAll')} <Icon name="chevron" size={16} /></button>}</div>
              {cards.length ? <div className="recent-list">{cards.slice(0, 4).map((card) => {
                const folder = folders.find((item) => item.id === card.folderId)
                return <div className="recent-card" key={card.id}><div className="recent-card-icon"><Icon name="book" size={18} /></div><div className="recent-card-copy"><strong>{card.front}</strong><span>{folder?.name ?? t('unsorted')}</span></div><button className="icon-button" aria-label={t('editCard', { front: card.front })} onClick={() => { setEditingCard(card); setModal('card') }}><Icon name="edit" size={17} /></button></div>
              })}</div> : <p className="soft-empty">{t('recentCardsEmpty')}</p>}
            </section>
          )}
        </div>
      </main>

      <nav className="mobile-bottom-nav" aria-label={t('mobileNavigation')}>
        <button className={`mobile-tab ${screen === 'home' && !selectedFolder ? 'active' : ''}`} onClick={() => enterFolder(null)}><Icon name="home" size={19} /><span>{t('library')}</span></button>
        <button className={`mobile-tab ${screen === 'study' ? 'active' : ''}`} onClick={() => { setSelectedFolder(null); setSelectedStudyMode(null); setScreen('study'); setProfileOpen(false) }}><Icon name="cards" size={19} /><span>{t('practice')}</span></button>
        <button className={`mobile-tab ${screen === 'folder' || sidebarOpen ? 'active' : ''}`} onClick={() => { setSidebarOpen(true); setProfileOpen(false) }}><Icon name="folder" size={19} /><span>{t('folders')}</span></button>
        <button className={`mobile-tab ${profileOpen ? 'active' : ''}`} onClick={() => setProfileOpen((open) => !open)} aria-expanded={profileOpen}><span className="mobile-tab-avatar">{initials(user.name)}</span><span>{t('profile')}</span></button>
        {profileOpen && <div className="mobile-profile-menu"><strong>{user.name}</strong><span>{user.email}</span><LanguageSelect /><button onClick={signOut}><Icon name="logout" size={16} />{t('signOut')}</button></div>}
      </nav>

      {modal === 'folder' && <FolderModal folder={screen === 'folder' ? currentFolder : null} onClose={() => setModal(null)} onSave={async (name, color, folder) => {
        if (folder) await api(`/folders/${folder.id}`, { method: 'PATCH', body: JSON.stringify({ name, color }) })
        else await api('/folders', { method: 'POST', body: JSON.stringify({ name, color }) })
        await refresh(folder ? t('folderUpdated') : t('folderCreated'))
      }} />}
      {modal === 'card' && <CardModal folders={folders} selectedFolder={selectedFolder} card={editingCard} onClose={() => { setModal(null); setEditingCard(null) }} onSave={async (values) => {
        if (editingCard) await api(`/cards/${editingCard.id}`, { method: 'PATCH', body: JSON.stringify(values) })
        else await api('/cards', { method: 'POST', body: JSON.stringify(values) })
        await refresh(editingCard ? t('cardUpdated') : t('cardAdded'))
      }} />}
      {modal === 'import' && <ImportModal folders={folders} selectedFolder={selectedFolder} onClose={() => setModal(null)} onSave={async (folderId, parsedCards) => {
        const result = await api<{ count: number }>('/cards/import', { method: 'POST', body: JSON.stringify({ folderId, cards: parsedCards }) })
        await refresh(t('cardsAdded', { count: result.count }))
      }} />}
      {error && <div className="toast toast-error" role="alert">{error}<button onClick={() => setError('')} aria-label={t('dismiss')}><Icon name="close" size={16} /></button></div>}
      {notice && <div className="toast" role="status"><span className="toast-check"><Icon name="check" size={14} /></span>{notice}</div>}
    </div>
  )
}

function greeting(t: Translate) {
  const hour = new Date().getHours()
  return t(hour < 12 ? 'goodMorning' : hour < 18 ? 'goodAfternoon' : 'goodEvening')
}

function LanguageSelect() {
  const { language, setLanguage, t } = useLocale()
  return <label className="language-control">
    <span className="sr-only">{t('language')}</span>
    <select aria-label={t('language')} value={language} onChange={(event) => {
      if (event.target.value === 'en' || event.target.value === 'mn') setLanguage(event.target.value)
    }}>
      <option value="en">{t('english')}</option>
      <option value="mn">{t('mongolian')}</option>
    </select>
  </label>
}

function AuthScreen({ onAuthenticated, initialError, theme, onThemeChange }: { onAuthenticated: (user: User) => void; initialError: string; theme: 'light' | 'dark'; onThemeChange: (theme: 'light' | 'dark') => void }) {
  const { t } = useLocale()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      const user = await api<User>(`/auth/${mode}`, { method: 'POST', body: JSON.stringify({ name, email, password }) })
      onAuthenticated(user)
    } catch (requestError) {
      setError(translateError(requestError, t, 'pleaseTryAgain'))
    } finally {
      setBusy(false)
    }
  }

  return <main className="auth-page">
    <header className="auth-header">
      <a className="auth-brand" href="#" onClick={(event) => event.preventDefault()} aria-label={t('authHome')}><div className="brand-mark">c</div><span>cardly</span></a>
      <div className="auth-header-actions">
        <LanguageSelect />
        <button className="icon-button auth-theme-toggle" onClick={() => onThemeChange(theme === 'dark' ? 'light' : 'dark')} aria-label={t(theme === 'dark' ? 'switchToLight' : 'switchToDark')} title={t(theme === 'dark' ? 'switchToLight' : 'switchToDark')}><Icon name={theme === 'dark' ? 'sun' : 'moon'} size={18} /></button>
      </div>
    </header>
    <div className="auth-layout">
      <section className="auth-intro">
        <div className="auth-kicker"><span />{t('yourMemoryShelf')}</div>
        <h1>{t('makeItLead')} <em>{t('makeItFinish')}</em></h1>
        <p>{t('authIntro')}</p>
        <div className="auth-preview">
          <div className="auth-preview-top"><span><i />{t('activeRecall')}</span><span>{t('oneCardAtATime')}</span></div>
          <p className="auth-preview-label">{t('question')}</p>
          <p className="auth-preview-question">{t('authPreviewQuestion')}</p>
          <div className="auth-preview-answer"><Icon name="sparkles" size={17} /><span>{t('recallLine')}</span></div>
          <div className="auth-preview-footer"><span>{t('fourWays')}</span><span>{t('littleSessions')}</span></div>
        </div>
        <div className="auth-mode-summary"><span className="summary-dot" /><span>{t('pairIt')}</span><span>·</span><span>{t('guessIt')}</span><span>·</span><span>{t('recallIt')}</span><span>·</span><span>{t('typeIt')}</span></div>
      </section>
      <section className="auth-card">
        <div className="auth-tabs"><button className={mode === 'login' ? 'selected' : ''} onClick={() => { setMode('login'); setError('') }}>{t('signIn')}</button><button className={mode === 'register' ? 'selected' : ''} onClick={() => { setMode('register'); setError('') }}>{t('createAccount')}</button></div>
        <div className="auth-card-title"><h2>{mode === 'register' ? t('freshStart') : t('welcomeBack')}</h2><p>{mode === 'register' ? t('keepCardsClose') : t('pickUp')}</p></div>
        <form onSubmit={submit} className="form-stack">
          {mode === 'register' && <label>{t('yourName')}<input autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} placeholder={t('namePlaceholder')} required maxLength={60} /></label>}
          <label>{t('emailAddress')}<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required /></label>
          <label>{t('password')}<input type="password" autoComplete={mode === 'register' ? 'new-password' : 'current-password'} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={mode === 'register' ? t('passwordHint') : t('passwordPlaceholder')} minLength={mode === 'register' ? 8 : undefined} required /></label>
          {error && <p className="form-error" role="alert">{error}</p>}
          {initialError && <p className="form-error" role="alert">{initialError}</p>}
          <button className="button button-dark auth-submit" disabled={busy}>{busy ? t('oneMoment') : mode === 'register' ? t('createMyAccount') : t('signInLibrary')}<Icon name="chevron" size={17} /></button>
        </form>
        <p className="auth-footnote"><Icon name="check" size={14} />{t('privateCards')}</p>
        <p className="auth-switch-prompt">{mode === 'register' ? t('alreadyAccount') : t('newToCardly')} <button onClick={() => { setMode(mode === 'register' ? 'login' : 'register'); setError('') }}>{mode === 'register' ? t('signIn') : t('createAccount')} <Icon name="chevron" size={14} /></button></p>
      </section>
    </div>
    <footer className="auth-footer"><span>{t('thoughtfulTools')}</span><span>{t('warmPaper')}</span></footer>
  </main>
}

function CardList({ cards, search, setSearch, onEdit, onDelete }: { cards: Flashcard[]; search: string; setSearch: (value: string) => void; onEdit: (card: Flashcard) => void; onDelete: (card: Flashcard) => void }) {
  const { t } = useLocale()
  return <div className="card-list-section">
    <div className="list-toolbar"><div><p className="eyebrow">{t('inThisFolder')}</p><h2>{t('allCards')} <span className="muted-count">{cards.length}</span></h2></div><label className="search-box"><Icon name="search" size={17} /><input placeholder={t('findCard')} value={search} onChange={(event) => setSearch(event.target.value)} /></label></div>
    {cards.length ? <div className="flashcard-list">{cards.map((card, index) => <article className="flashcard-row" key={card.id}><div className="card-index">{String(index + 1).padStart(2, '0')}</div><div className="flashcard-content"><strong>{card.front}</strong><span>{card.back || t('answerNotAdded')}</span><div className="card-meta"><span className={`card-mode-tag mode-${card.studyMode || 'recall'}`}>{t(studyModes.find((mode) => mode.id === card.studyMode)?.titleKey ?? 'recallIt')}</span>{card.tags?.slice(0, 3).map((tag) => <span className="card-tag" key={tag}>{tag}</span>)}</div></div><button className="icon-button" onClick={() => onEdit(card)} aria-label={t('editCard', { front: card.front })}><Icon name="edit" size={17} /></button><button className="icon-button delete-icon" onClick={() => onDelete(card)} aria-label={t('deleteCard', { front: card.front })}><Icon name="trash" size={17} /></button></article>)}</div> : <div className="list-empty"><Icon name="cards" size={28} /><p>{search ? t('noCardsMatch') : t('firstCardEmpty')}</p></div>}
  </div>
}

function shuffle<T,>(items: T[]) {
  const shuffled = [...items]
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1))
    ;[shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]]
  }
  return shuffled
}

function normalizeAnswer(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase()
}

const studyModes: { id: StudyMode; titleKey: 'pairIt' | 'guessIt' | 'recallIt' | 'typeIt'; descriptionKey: 'pairDescription' | 'guessDescription' | 'recallDescription' | 'typeDescription'; icon: string }[] = [
  { id: 'pair', titleKey: 'pairIt', descriptionKey: 'pairDescription', icon: 'shuffle' },
  { id: 'guess', titleKey: 'guessIt', descriptionKey: 'guessDescription', icon: 'sparkles' },
  { id: 'recall', titleKey: 'recallIt', descriptionKey: 'recallDescription', icon: 'cards' },
  { id: 'type', titleKey: 'typeIt', descriptionKey: 'typeDescription', icon: 'edit' },
]

function StudyView({ cards, folderName, initialMode, onExit }: { cards: Flashcard[]; folderName: string; initialMode: StudyMode | null; onExit: () => void }) {
  const { t } = useLocale()
  const [mode, setMode] = useState<StudyMode | null>(initialMode)
  const [sessionCards, setSessionCards] = useState<Flashcard[]>(() => initialMode
    ? shuffle(initialMode === 'recall' ? cards : cards.filter((card) => card.back.trim()))
    : [])
  const [index, setIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [known, setKnown] = useState(0)
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null)
  const [typedAnswer, setTypedAnswer] = useState('')
  const [typeResult, setTypeResult] = useState<boolean | null>(null)
  const availableCards = useMemo(() => cards.filter((card) => card.back.trim()), [cards])
  const uniqueAnswers = useMemo(() => [...new Set(availableCards.map((card) => normalizeAnswer(card.back)))], [availableCards])
  const current = sessionCards[index]
  const choices = useMemo(() => {
    if (mode !== 'guess' || !current) return []
    const distractors = [...new Map(availableCards
      .filter((card) => normalizeAnswer(card.back) !== normalizeAnswer(current.back))
      .map((card) => [normalizeAnswer(card.back), card.back])).values()]
    return shuffle([current.back, ...shuffle(distractors).slice(0, 3)])
  }, [availableCards, current, mode])

  const startMode = (nextMode: StudyMode) => {
    setMode(nextMode)
    setSessionCards(shuffle(nextMode === 'recall' ? cards : availableCards))
    setIndex(0)
    setKnown(0)
    setFlipped(false)
    setSelectedAnswer(null)
    setTypedAnswer('')
    setTypeResult(null)
  }

  const backToModes = () => {
    setMode(null)
    setSessionCards([])
    setIndex(0)
    setKnown(0)
  }

  const rateCard = (remembered: boolean) => {
    setKnown((value) => value + (remembered ? 1 : 0))
    setFlipped(false)
    setSelectedAnswer(null)
    setTypedAnswer('')
    setTypeResult(null)
    setIndex((value) => value + 1)
  }

  const finishAnswer = (answer: string) => {
    const isCorrect = normalizeAnswer(answer) === normalizeAnswer(current.back)
    setSelectedAnswer(answer)
    setKnown((value) => value + (isCorrect ? 1 : 0))
  }

  const finishSession = mode !== null && index >= sessionCards.length

  if (!mode) {
    return <div className="study-wrap study-mode-screen">
      <button className="back-link" onClick={onExit}><Icon name="back" size={17} />{t('backToLibrary')}</button>
      <div className="study-heading"><p className="eyebrow">{t('pickPractice')}</p><h1>{folderName}</h1><p>{t('fourWaysToLearn')}</p></div>
      {!cards.length ? <div className="study-empty"><Icon name="cards" size={27} /><p>{t('addCardsToStudy')}</p></div> : <div className="study-mode-grid">
        {studyModes.map((studyMode) => {
          const needsAnswers = studyMode.id !== 'recall'
          const available = studyMode.id === 'pair' ? availableCards.length >= 2 : studyMode.id === 'guess' ? uniqueAnswers.length >= 2 : studyMode.id === 'type' ? availableCards.length > 0 : cards.length > 0
          const availabilityHint = studyMode.id === 'pair' ? t('addTwoAnswers') : studyMode.id === 'guess' ? t('addTwoDifferentAnswers') : t('addOneAnswer')
          return <button key={studyMode.id} className="study-mode-card" disabled={!available} onClick={() => startMode(studyMode.id)}>
            <span className="mode-icon"><Icon name={studyMode.icon} size={21} /></span><span className="mode-copy"><strong>{t(studyMode.titleKey)}</strong><span>{t(studyMode.descriptionKey)}</span></span><Icon name="chevron" size={17} />
            <span className="mode-footnote">{available ? studyMode.id === 'recall' ? t('cardCount', { count: cards.length }) : t('answeredCardCount', { count: availableCards.length }) : availabilityHint}</span>
            {needsAnswers && !available && <span className="sr-only">{availabilityHint}</span>}
          </button>
        })}
      </div>}
    </div>
  }
  if (mode === 'pair') {
    return <div className="study-wrap"><button className="back-link" onClick={backToModes}><Icon name="back" size={17} />{t('changeStudyMode')}</button><PairGame cards={sessionCards} onFinish={backToModes} /></div>
  }
  if (finishSession) {
    return <div className="study-wrap"><button className="back-link" onClick={backToModes}><Icon name="back" size={17} />{t('chooseAnotherMode')}</button><div className="study-finish"><div className="finish-spark">✳</div><p className="eyebrow">{t('sessionComplete')}</p><h1>{t('showingUp')}<br /><em>{t('showingUpLine')}</em></h1><p>{t('scoreResult', { known, total: sessionCards.length })}</p><button className="button button-dark" onClick={onExit}>{t('backToFolder', { folder: folderName })}</button></div></div>
  }
  if (!current) {
    return <div className="study-wrap"><button className="back-link" onClick={backToModes}><Icon name="back" size={17} />{t('chooseAnotherMode')}</button><div className="study-empty"><Icon name="book" size={27} /><p>{t('needsAnswers')}</p></div></div>
  }

  const typedCorrect = typeResult === true

  return <div className="study-wrap">
    <button className="back-link" onClick={backToModes}><Icon name="back" size={17} />{t('changeStudyMode')}</button>
    <div className="study-heading study-heading-compact"><p className="eyebrow">{t(studyModes.find((item) => item.id === mode)!.titleKey).toUpperCase()}</p><h1>{folderName}</h1><p>{mode === 'recall' ? t('oneCardNoRush') : t('takeYourTime')}</p></div>
    <div className="study-progress"><span style={{ width: `${(index / sessionCards.length) * 100}%` }} /></div>
    <div className="study-count"><span>{t('cardProgress', { current: index + 1, total: sessionCards.length })}</span><span>{t('rightCount', { count: known })}</span></div>
    {mode === 'recall' ? <>
      <button key={current.id} className={`study-card ${flipped ? 'is-flipped' : ''}`} onClick={() => setFlipped((value) => !value)} aria-label={flipped ? t('showQuestion') : t('revealAnswer')}>
        <span className="study-card-inner">
          <span className="study-card-face study-card-front"><span className="study-card-label">{t('question')}</span><span className="study-card-text">{current.front}</span><span className="study-card-hint">{t('tapToReveal')}</span></span>
          <span className="study-card-face study-card-back"><span className="study-card-label">{t('answer')}</span><span className="study-card-text">{current.back || t('noAnswer')}</span><span className="study-card-hint">{t('tapForQuestion')}</span></span>
        </span>
      </button>
      {flipped ? <div className="study-rating"><button className="button button-light" onClick={() => rateCard(false)}>{t('notYet')}</button><button className="button button-dark" onClick={() => rateCard(true)}><Icon name="check" size={17} />{t('gotIt')}</button></div> : <button className="button button-dark reveal-button" onClick={() => setFlipped(true)}>{t('showAnswer')}</button>}
    </> : mode === 'guess' ? <>
      <div key={current.id} className="question-panel"><span className="study-card-label">{t('whatDoesItMean')}</span><p className="question-prompt">{current.front}</p></div>
      <div className="answer-options">{choices.map((choice, choiceIndex) => {
        const isSelected = selectedAnswer === choice
        const isCorrectChoice = normalizeAnswer(choice) === normalizeAnswer(current.back)
        const resultClass = selectedAnswer === null ? '' : isCorrectChoice ? 'option-correct' : isSelected ? 'option-wrong' : 'option-muted'
        return <button key={`${current.id}-${choice}`} className={`answer-option ${resultClass}`} disabled={selectedAnswer !== null} onClick={() => finishAnswer(choice)}><span className="option-letter">{String.fromCharCode(65 + choiceIndex)}</span><span>{choice}</span>{selectedAnswer !== null && isCorrectChoice && <Icon name="check" size={17} />}</button>
      })}</div>
      {selectedAnswer !== null && <div className={`answer-feedback ${normalizeAnswer(selectedAnswer) === normalizeAnswer(current.back) ? 'feedback-correct' : 'feedback-wrong'}`}><span>{normalizeAnswer(selectedAnswer) === normalizeAnswer(current.back) ? t('thatsRight') : t('notQuite', { answer: current.back })}</span><button className="button button-dark" onClick={() => rateCard(false)}>{t('nextCard')}<Icon name="chevron" size={16} /></button></div>}
    </> : <>
      <div key={current.id} className="question-panel"><span className="study-card-label">{t('typeTheAnswer')}</span><p className="question-prompt">{current.front}</p></div>
      <form className="type-answer-form" onSubmit={(event) => { event.preventDefault(); if (typeResult === null) { const isCorrect = normalizeAnswer(typedAnswer) === normalizeAnswer(current.back); setTypeResult(isCorrect); if (isCorrect) setKnown((value) => value + 1) } }}>
        <label className="sr-only" htmlFor="study-answer">{t('yourAnswer')}</label><input id="study-answer" autoComplete="off" autoFocus key={current.id} value={typedAnswer} onChange={(event) => setTypedAnswer(event.target.value)} placeholder={t('writeRemember')} disabled={typeResult !== null} />
        {typeResult === null ? <button className="button button-dark" disabled={!typedAnswer.trim()}>{t('checkAnswer')}<Icon name="chevron" size={16} /></button> : <div className={`type-result ${typedCorrect ? 'feedback-correct' : 'feedback-wrong'}`}><span>{typedCorrect ? t('exactlyRight') : t('answerIs', { answer: current.back })}</span><button className="button button-dark" type="button" onClick={() => rateCard(false)}>{t('nextCard')}<Icon name="chevron" size={16} /></button></div>}
      </form>
    </>}
  </div>
}

function PairGame({ cards, onFinish }: { cards: Flashcard[]; onFinish: () => void }) {
  const { t } = useLocale()
  const rounds = useMemo(() => {
    const shuffledCards = shuffle(cards)
    const result: Flashcard[][] = []
    for (let index = 0; index < shuffledCards.length; index += 6) result.push(shuffledCards.slice(index, index + 6))
    return result
  }, [cards])
  const [roundIndex, setRoundIndex] = useState(0)
  const [matchedIds, setMatchedIds] = useState<string[]>([])
  const [selectedPrompt, setSelectedPrompt] = useState<string | null>(null)
  const [wrongIds, setWrongIds] = useState<string[]>([])
  const [totalMatches, setTotalMatches] = useState(0)
  const wrongTimeout = useRef<number | null>(null)
  const round = rounds[roundIndex] ?? []
  const answerCards = useMemo(() => shuffle(rounds[roundIndex] ?? []), [roundIndex, rounds])
  const roundComplete = matchedIds.length === round.length
  const gameComplete = roundIndex >= rounds.length

  useEffect(() => () => {
    if (wrongTimeout.current !== null) window.clearTimeout(wrongTimeout.current)
  }, [])

  const choosePrompt = (id: string) => {
    if (wrongIds.length || matchedIds.includes(id)) return
    setSelectedPrompt(id === selectedPrompt ? null : id)
  }

  const chooseAnswer = (id: string) => {
    if (!selectedPrompt || wrongIds.length || matchedIds.includes(id)) return
    if (selectedPrompt === id) {
      setMatchedIds((existing) => [...existing, id])
      setTotalMatches((count) => count + 1)
      setSelectedPrompt(null)
      return
    }
    setWrongIds([selectedPrompt, id])
    wrongTimeout.current = window.setTimeout(() => {
      setWrongIds([])
      setSelectedPrompt(null)
    }, 650)
  }

  const nextRound = () => {
    setRoundIndex((value) => value + 1)
    setMatchedIds([])
    setSelectedPrompt(null)
  }

  if (gameComplete) {
    return <div className="study-finish"><div className="finish-spark">✳</div><p className="eyebrow">{t('allPairsMatched')}</p><h1>{t('niceWork')}<br /><em>{t('youFoundThem')}</em></h1><p>{t('matchedPairCount', { count: totalMatches })}</p><button className="button button-dark" onClick={onFinish}>{t('chooseAnotherMode')}</button></div>
  }

  return <div className="pair-game">
    <div className="study-heading study-heading-compact"><p className="eyebrow">{t('pairIt')} · {t('round', { current: roundIndex + 1, total: rounds.length })}</p><h1>{t('findMatches')}</h1><p>{t('choosePromptAnswer')}</p></div>
    <div className="study-progress"><span style={{ width: `${(totalMatches / cards.length) * 100}%` }} /></div>
    <div className="study-count"><span>{t('pairsFound', { found: matchedIds.length, total: round.length })}</span><span>{t('totalMatched', { count: totalMatches })}</span></div>
    {roundComplete ? <div className="pair-round-complete"><span className="mode-icon"><Icon name="check" size={22} /></span><h2>{t('roundMatched')}</h2><p>{t('youFoundPairs', { count: round.length })}</p><button className="button button-dark" onClick={nextRound}>{roundIndex + 1 === rounds.length ? t('seeResults') : t('nextRound')}<Icon name="chevron" size={16} /></button></div> : <div className="pair-columns">
      <div className="pair-column"><p className="pair-column-label">{t('prompts')}</p>{round.map((card) => <button key={card.id} className={`pair-choice ${selectedPrompt === card.id ? 'pair-selected' : ''} ${matchedIds.includes(card.id) ? 'pair-matched' : ''} ${wrongIds.includes(card.id) ? 'pair-wrong' : ''}`} disabled={matchedIds.includes(card.id)} onClick={() => choosePrompt(card.id)}>{card.front}</button>)}</div>
      <div className="pair-column"><p className="pair-column-label">{t('answers')}</p>{answerCards.map((card) => <button key={card.id} className={`pair-choice ${matchedIds.includes(card.id) ? 'pair-matched' : ''} ${wrongIds.includes(card.id) ? 'pair-wrong' : ''}`} disabled={matchedIds.includes(card.id) || !selectedPrompt} onClick={() => chooseAnswer(card.id)}>{card.back}</button>)}</div>
    </div>}
  </div>
}

function ModalFrame({ title, subtitle, onClose, children, className = '' }: { title: string; subtitle: string; onClose: () => void; children: ReactNode; className?: string }) {
  const { t } = useLocale()
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section className={`modal-card ${className}`} role="dialog" aria-modal="true" aria-labelledby="modal-title"><button className="icon-button modal-close" onClick={onClose} aria-label={t('close')}><Icon name="close" /></button><p className="eyebrow">{t('makeItYours')}</p><h2 id="modal-title">{title}</h2><p className="modal-subtitle">{subtitle}</p>{children}</section></div>
}

function FolderModal({ folder, onClose, onSave }: { folder: Folder | null; onClose: () => void; onSave: (name: string, color: string, folder: Folder | null) => Promise<void> }) {
  const { t } = useLocale()
  const [name, setName] = useState(folder?.name ?? '')
  const [color, setColor] = useState(folder?.color ?? colors[0])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    try { await onSave(name.trim(), color, folder); onClose() } catch (requestError) { setError(translateError(requestError, t, 'couldNotSaveFolder')) } finally { setBusy(false) }
  }
  return <ModalFrame title={folder ? t('folderUpdate') : t('newFolderTitle')} subtitle={folder ? t('changeFolder') : t('nameYourFolder')} onClose={onClose}><form className="form-stack modal-form" onSubmit={submit}><label>{t('folderName')}<input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder={t('folderNamePlaceholder')} maxLength={50} required /></label><div className="color-field"><span>{t('pickColor')}</span><div className="color-options">{colors.map((option) => <button key={option} type="button" className={`color-swatch ${color === option ? 'chosen' : ''}`} style={{ backgroundColor: option }} onClick={() => setColor(option)} aria-label={`${t('pickColor')}: ${option}`} />)}</div></div>{error && <p className="form-error" role="alert">{error}</p>}<button className="button button-dark modal-submit" disabled={busy}>{busy ? t('saving') : folder ? t('saveFolder') : t('createFolder')}<Icon name="chevron" size={17} /></button></form></ModalFrame>
}

function CardModal({ folders, selectedFolder, card, onClose, onSave }: { folders: Folder[]; selectedFolder: string | null; card: Flashcard | null; onClose: () => void; onSave: (values: { front: string; back: string; folderId: string | null; studyMode: StudyMode; tags: string[] }) => Promise<void> }) {
  const { t } = useLocale()
  const [front, setFront] = useState(card?.front ?? '')
  const [back, setBack] = useState(card?.back ?? '')
  const [folderId, setFolderId] = useState(card?.folderId ?? selectedFolder ?? '')
  const [studyMode, setStudyMode] = useState<StudyMode>(card?.studyMode ?? 'recall')
  const [tags, setTags] = useState<string[]>(card?.tags ?? [])
  const [tagDraft, setTagDraft] = useState('')
  const [previewBack, setPreviewBack] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const addTags = (value: string) => {
    const newTags = value.split(',').map((tag) => tag.trim()).filter(Boolean)
    if (!newTags.length) return
    const merged = [...new Set([...tags, ...newTags])]
    if (merged.length > 8) { setError(t('tagLimit')); return }
    if (newTags.some((tag) => tag.length > 24)) { setError(t('tagLengthLimit')); return }
    setTags(merged)
    setTagDraft('')
    setError('')
  }
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const savedTags = [...new Set([...tags, ...tagDraft.split(',').map((tag) => tag.trim()).filter(Boolean)])]
    if (savedTags.length > 8) { setError(t('tagLimit')); return }
    if (savedTags.some((tag) => tag.length > 24)) { setError(t('tagLengthLimit')); return }
    setBusy(true)
    try { await onSave({ front: front.trim(), back: back.trim(), folderId: folderId || null, studyMode, tags: savedTags }); onClose() } catch (requestError) { setError(translateError(requestError, t, 'couldNotSaveCard')) } finally { setBusy(false) }
  }
  return <ModalFrame className="card-editor-dialog" title={card ? t('editCardTitle') : t('cardEditorTitle')} subtitle={t('cardEditorSubtitle')} onClose={onClose}>
    <div className="card-editor-layout">
      <form className="form-stack modal-form card-editor-form" onSubmit={submit}>
        <fieldset className="study-style-field">
          <legend>{t('studyStyle')} <span className="label-note">{t('favoriteForCard')}</span></legend>
          <div className="study-style-options">{studyModes.map((mode) => <button key={mode.id} type="button" className={`study-style-option ${studyMode === mode.id ? 'chosen' : ''}`} onClick={() => setStudyMode(mode.id)} aria-pressed={studyMode === mode.id}><span className="style-option-icon"><Icon name={mode.icon} size={16} /></span><span><strong>{t(mode.titleKey)}</strong><small>{t(mode.descriptionKey)}</small></span>{studyMode === mode.id && <Icon name="check" size={15} />}</button>)}</div>
        </fieldset>
        <label>{t('front')} <span className="label-note">{t('promptLabel')}</span><textarea autoFocus value={front} onChange={(event) => setFront(event.target.value)} placeholder={t('frontPlaceholder')} required maxLength={500} rows={4} /><span className="field-count">{front.length}/500</span></label>
        <label>{t('back')} <span className="label-note">{t('definitionLabel')}</span><textarea value={back} onChange={(event) => setBack(event.target.value)} placeholder={t('backPlaceholder')} maxLength={2000} rows={4} /><span className="field-count">{back.length}/2000</span></label>
        <div className="card-editor-fields">
          <label>{t('folder')}<select value={folderId} onChange={(event) => setFolderId(event.target.value)}><option value="">{t('unsorted')}</option>{folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select></label>
          <label>{t('tags')} <span className="label-note">{t('tagHint')}</span><input value={tagDraft} onChange={(event) => setTagDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ',') { event.preventDefault(); addTags(tagDraft) } }} placeholder={t('tagPlaceholder')} /></label>
        </div>
        {tags.length > 0 && <div className="tag-chip-list" aria-label={t('cardTags')}>{tags.map((tag) => <span className="tag-chip" key={tag}>{tag}<button type="button" onClick={() => setTags((current) => current.filter((value) => value !== tag))} aria-label={t('removeTag', { tag })}><Icon name="close" size={12} /></button></span>)}</div>}
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="button button-dark modal-submit" disabled={busy}>{busy ? t('saving') : card ? t('saveChanges') : t('addCardToLibrary')}<Icon name="chevron" size={17} /></button>
      </form>
      <aside className="card-preview-panel">
        <div className="preview-heading"><span>{t('livePreview')}</span><span className="preview-mode">{t(studyModes.find((mode) => mode.id === studyMode)!.titleKey)}</span></div>
        <button type="button" className={`card-preview ${previewBack ? 'preview-flipped' : ''}`} onClick={() => setPreviewBack((value) => !value)} aria-label={t('flipCardPreview')}>
          <span className="preview-card-top"><span><Icon name="sparkles" size={15} />CARDLY</span><span>{previewBack ? t('answer') : t('prompt')}</span></span>
          <span className="preview-card-copy">{previewBack ? (back || t('yourAnswerHere')) : (front || t('yourQuestionHere'))}</span>
          <span className="preview-card-hint"><Icon name="cards" size={14} />{t('tapToFlip')}</span>
        </button>
        <p className="preview-tip"><span className="preview-tip-mark">✳</span>{t('focusOneIdea')}</p>
      </aside>
    </div>
  </ModalFrame>
}

function ImportModal({ folders, selectedFolder, onClose, onSave }: { folders: Folder[]; selectedFolder: string | null; onClose: () => void; onSave: (folderId: string | null, cards: { front: string; back: string }[]) => Promise<void> }) {
  const { t } = useLocale()
  const [text, setText] = useState('')
  const [folderId, setFolderId] = useState(selectedFolder ?? '')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const parsed = useMemo(() => parseWordList(text), [text])
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!parsed.length) { setError(t('addWordFirst')); return }
    if (parsed.length > 100) { setError(t('importLimit')); return }
    setBusy(true)
    try { await onSave(folderId || null, parsed); onClose() } catch (requestError) { setError(translateError(requestError, t, 'couldNotImport')) } finally { setBusy(false) }
  }
  return <ModalFrame title={t('importTitle')} subtitle={t('importSubtitle')} onClose={onClose}><form className="form-stack modal-form" onSubmit={submit}><label>{t('yourWords')}<textarea autoFocus className="list-input" value={text} onChange={(event) => { setText(event.target.value); setError('') }} placeholder={t('importExample')} rows={7} /></label><div className="import-preview"><span><Icon name="sparkles" size={16} />{t('cardsReady', { count: parsed.length })}</span><span>{t('blankBackHint')}</span></div><label>{t('putThemIn')}<select value={folderId} onChange={(event) => setFolderId(event.target.value)}><option value="">{t('unsorted')}</option>{folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select></label>{error && <p className="form-error" role="alert">{error}</p>}<button className="button button-dark modal-submit" disabled={busy || parsed.length === 0}>{busy ? t('makingCards') : t('createCards', { count: parsed.length })}<Icon name="chevron" size={17} /></button></form></ModalFrame>
}

function AdminCardImport({ onComplete }: { onComplete: (result: { count: number; delivery: 'added' | 'pending' }) => void }) {
  const { t } = useLocale()
  const [fileName, setFileName] = useState('')
  const [cards, setCards] = useState<{ front: string; back: string }[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const selectFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    setError('')
    setFileName('')
    setCards([])
    if (!file) return
    if (file.size > 40_000) {
      setError(t('fileTooLarge'))
      return
    }
    if (!file.name.toLowerCase().endsWith('.txt') && !file.name.toLowerCase().endsWith('.csv')) {
      setError(t('unsupportedCardFile'))
      return
    }

    try {
      const contents = await file.text()
      const parsed = parseCardFile(contents, file.name)
      setFileName(file.name)
      setCards(parsed)
      if (parsed.length > 100) setError(t('importLimit'))
      else if (!parsed.length) setError(t('addWordFirst'))
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : t('genericTryAgain'))
    }
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!cards.length || cards.length > 100) return
    setBusy(true)
    setError('')
    try {
      const result = await api<{ count: number; delivery: 'added' | 'pending' }>('/admin/cards/import', {
        method: 'POST',
        body: JSON.stringify({ cards }),
      })
      onComplete(result)
    } catch (requestError) {
      setError(translateError(requestError, t, 'couldNotImport'))
    } finally {
      setBusy(false)
    }
  }

  return <section className="admin-import-page">
    <p className="eyebrow">{t('adminImportEyebrow')}</p>
    <h1>{t('adminImportTitle')}</h1>
    <p className="admin-import-description">{t('adminImportDescription')}</p>
    <div className="import-preview admin-recipient-notice">
      <span><Icon name="sparkles" size={16} />{t('adminRecipientMatching')}</span>
      <span>{t('adminPendingExplanation')}</span>
    </div>
    <form className="form-stack admin-import-form" onSubmit={submit}>
      <label>{t('selectCardFile')}<input type="file" accept=".txt,.csv,text/plain,text/csv" onChange={selectFile} /></label>
      <p className="admin-file-hint">{t('cardFileFormat')}</p>
      {fileName && <div className="import-preview"><span><Icon name="cards" size={16} />{fileName}</span><span>{t('cardsReady', { count: cards.length })}</span></div>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="button button-dark" disabled={busy || !cards.length || cards.length > 100}><Icon name="upload" size={17} />{busy ? t('makingCards') : t('uploadCards', { count: cards.length })}</button>
    </form>
  </section>
}

export default App
