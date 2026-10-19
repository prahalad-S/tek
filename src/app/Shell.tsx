import ThemeSwitcher from "./ThemeSwitcher";
import JarvisIntro from "../features/JarvisIntro";
import { assignedJiraQuery } from "../lib/jiraIssueCache";
import { useState, useEffect, lazy, Suspense } from "react";
import {
  NavLink,
  Outlet,
  Link,
  Navigate,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Code2,
  LayoutDashboard,
  Users,
  CalendarDays,
  Clock3,
  FolderKanban,
  CheckCheck,
  FileText,
  Coffee,
  Settings2,
  Sparkles,
  Search,
  Bell,
  Menu,
  X,
  LogOut,
  ArrowUpRight,
  ChevronDown,
  Command,
  ArrowLeft,
  Mail,
  PanelsTopLeft,
  MessageSquare,
  Palmtree,
  ChartNoAxesCombined,
  MapPin,
  UserRound,
} from "lucide-react";
import { useAuth } from "./providers";
import { notices, rpc } from "../lib/api";
import {
  Brand,
  Avatar,
  Loading,
  Modal,
  EmptyState,
  ErrorState,
  PreviewNote,
  useToast,
} from "../components/ui";
import { errorMessage } from "../lib/domain";
const JarvisOverlay = lazy(() => import("../features/JarvisOverlay"));
const JiraPanel = lazy(() => import("../features/Jira"));
const jarvisIntroSeenThisPage = new Set<string>();
export default function Shell() {
  const {
    profile,
    member,
    session,
    loading,
    error,
    preview,
    signOut,
    refresh,
  } = useAuth();

  const [mobile, setMobile] = useState(false);
  const [assistant, setAssistant] = useState(false);
  const [jarvisBlur, setJarvisBlur] = useState(true);
  const [introVisible,setIntroVisible]=useState(false);
  const [introReveal,setIntroReveal]=useState(false);
  function openAssistant() {
    if(introVisible || assistant)return;
    setJarvisBlur(true);
    void import("../features/JarvisOverlay");
    const key=session?`tek-jarvis-intro:${session.user.id}:${session.user.last_sign_in_at || "signed-in"}`:"";
    if(!preview && key && !jarvisIntroSeenThisPage.has(key)) {
      jarvisIntroSeenThisPage.add(key);setIntroReveal(true);setIntroVisible(true);
    } else {setIntroReveal(false);setAssistant(true);}
  }
  const [jira, setJira] = useState(false);
  const [notification, setNotification] = useState(false);
  const [command, setCommand] = useState(false);
  const [search, setSearch] = useState("");
  const toast = useToast();
  const loc = useLocation();
  const navigate = useNavigate();
  const [account, setAccount] = useState(false);
  const qc = useQueryClient();
  useQuery({
    ...assignedJiraQuery(profile?.user_id || ""),
    enabled: !preview && !!session && !!profile?.user_id,
    refetchInterval: 60000,
    refetchOnWindowFocus: true,
  });
  const base = preview ? "/preview" : "";
  const n = useQuery({
    queryKey: ["notifications", preview, profile?.user_id],
    queryFn: async () => {
      if (preview) return [];
      await rpc("process_elapsed_leave");
      return notices();
    },
    enabled: !!profile,
    refetchInterval: 60000,
  });
  useEffect(() => {
    document.getElementById("main")?.scrollTo({ top: 0, behavior: "instant" });
    setMobile(false);
    setAccount(false);
  }, [loc.pathname, loc.search]);
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setCommand((x) => !x);
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  if (loading) return <Loading />;
  if (!preview && !session) return <Navigate to="/login" replace />;
  if (error)
    return (
      <main className="access-error">
        <Brand />
        <ErrorState error={new Error(error)} retry={() => void refresh()} />
        <button className="button secondary" onClick={() => void signOut()}>
          Sign out
        </button>
      </main>
    );
  if (!profile) return <Loading />;
  const links = [
    { path: "home", label: "Overview", icon: LayoutDashboard },
    { path: "people", label: "People", icon: Users },
    { path: "timesheets", label: "My timesheet", icon: Clock3 },
    { path: "calendar", label: "Calendar", icon: CalendarDays },
    { path: "projects", label: "Projects", icon: FolderKanban },
    { path: "editor", label: "Editor", icon: Code2 },
    { path: "leave", label: "Time off", icon: Coffee },
    { path: "documents", label: "Documents", icon: FileText },
    { path: "reports", label: "History", icon: Clock3 },
    ...(member?.role === "admin"
      ? [{ path: "access", label: "Access management", icon: Settings2 }]
      : []),
    ...(member?.role !== "employee"
      ? [{ path: "approvals", label: "Approvals", icon: CheckCheck }]
      : []),
  ];
  return (
    <div className={`app-shell${assistant && jarvisBlur ? " jarvis-open" : ""}`}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      {mobile && (
        <button
          className="sidebar-backdrop"
          aria-label="Close navigation"
          onClick={() => setMobile(false)}
        />
      )}
      <aside className={`sidebar ${mobile ? "sidebar--open" : ""}`}>
        <Link to={`${base}/home`} className="brand-link">
          <Brand />
        </Link>
        {/* <button className="sidebar-workspace">
          <span className="workspace-symbol">T</span>
          <span>
            <strong>Tekzenit workspace</strong>
            <small>People & work, together</small>
          </span>
          <ChevronDown size={14} />
        </button> */}
        <div className="nav-label">WORKSPACE</div>
        <nav aria-label="Main navigation">
          {links.map(({ path, label, icon: Icon }) => (
            <NavLink key={path} to={`${base}/${path}`}>
              <Icon size={19} />
              <span>{label}</span>
              {path === "people" && <span className="nav-indicator" />}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-integrations" aria-label="Integrations">
          <div className="nav-label">INTEGRATIONS</div>{" "}
          <button
            type="button"
            className="sidebar-integration"
            aria-label="Outlook mail — coming soon"
            title="Outlook mail — coming soon"
            onClick={() => toast("Outlook mail is coming soon.")}
          >
            <Mail size={19} />
            <span>Outlook mail</span>
            <small>Soon</small>
          </button>
          <button
            type="button"
            className="sidebar-integration"
            aria-label="Jira issues"
            title="Open Jira issues"
            onClick={() => {
              setMobile(false);
              setJira(true);
            }}
          >
            <PanelsTopLeft size={19} />
            <span>Jira</span>
            <small>Soon</small>
          </button>
          <NavLink
            to={`${base}/teams`}
            className="sidebar-integration teams-sidebar-link"
            title="Open Teams"
          >
            <MessageSquare size={19} />
            <span>Teams</span>
            <small>Preview</small>
          </NavLink>
        </div>
        <div className="sidebar-bottom">
          <NavLink className="settings-link" to={`${base}/profile`}>
            <Settings2 size={18} />
            Settings & profile
          </NavLink>
          <div className="sidebar-user">
            <Avatar person={profile} />
            <div>
              <strong>{profile.full_name}</strong>
              <span>
                {member?.role === "admin"
                  ? "Administrator"
                  : member?.role === "manager"
                    ? "Team manager"
                    : "Team member"}
              </span>
            </div>
            <button
              className="icon-button"
              aria-label="Sign out"
              onClick={() =>
                void signOut().catch((e) => toast(errorMessage(e), "error"))
              }
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      <div className="workspace-main">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMobile(true)}
            >
              <Menu size={21} />
            </button>
            <button
              className="icon-button"
              aria-label="Go back"
              title="Go back"
              onClick={() =>
                window.history.state?.idx > 0
                  ? navigate(-1)
                  : navigate(`${base}/home`)
              }
            >
              <ArrowLeft size={20} />
            </button>
            <span className="breadcrumb">
              Workspace <span>/</span>{" "}
              <strong>
                {links.find((l) => loc.pathname.endsWith(l.path))?.label ||
                  {
                    analytics: "Employee analytics",
                    maps: "Maps",
                    profile: "My profile",
                    teams: "Teams",
                    editor: "Editor",
                  }[
                    loc.pathname.split("/").pop() as
                      "analytics" | "maps" | "profile" | "teams"
                  ] ||
                  "Workspace"}
              </strong>
            </span>
          </div>
          <div className="topbar-actions">
            <button className="global-search" onClick={() => setCommand(true)}>
              <Search size={16} />
              <span>Find your way…</span>
              <kbd>⌘ K</kbd>
            </button>
            <span className="topbar-divider" />
            {[
              {
                path: "calendar?panel=holidays",
                label: "Holidays",
                Icon: Palmtree,
              },
              {
                path: "analytics",
                label: "Employee analytics",
                Icon: ChartNoAxesCombined,
              },
              { path: "maps", label: "Maps", Icon: MapPin },
            ].map(({ path, label, Icon }) => (
              <Link
                className="icon-button"
                key={path}
                to={`${base}/${path}`}
                aria-label={label}
                title={label}
              >
                <Icon size={19} />
              </Link>
            ))}
            <ThemeSwitcher />
            <button
              className="icon-button notification-button"
              aria-label="Open notifications"
              onClick={() => setNotification(true)}
            >
              <Bell size={19} />
              {n.data?.some((n) => !n.read_at) && <i />}
            </button>
            <div className="account-menu">
              <button
                className="icon-button"
                aria-label="Account menu"
                aria-expanded={account}
                onClick={() => setAccount(!account)}
              >
                <Avatar person={profile} size="small" />
              </button>
              {account && (
                <>
                  <button
                    className="account-backdrop"
                    aria-label="Close account menu"
                    onClick={() => setAccount(false)}
                  />
                  <div
                    className="account-dropdown"
                    onKeyDown={(e) => {
                      if (e.key === "Escape") setAccount(false);
                    }}
                  >
                    {[
                      {
                        path: `people?person=${encodeURIComponent(profile?.id || "")}`,
                        label: "My profile",
                        Icon: UserRound,
                      },
                      {
                        path: "people?team=mine",
                        label: "My team",
                        Icon: Users,
                      },
                      {
                        path: "projects?scope=mine",
                        label: "My projects",
                        Icon: FolderKanban,
                      },
                      {
                        path: "projects?scope=team",
                        label: "Team projects",
                        Icon: Users,
                      },
                      {
                        path: "profile",
                        label: "Settings & profile",
                        Icon: Settings2,
                      },
                    ].map(({ path, label, Icon }) => (
                      <Link key={path} to={base + "/" + path}>
                        <Icon size={17} />
                        {label}
                      </Link>
                    ))}
                    <button
                      onClick={() =>
                        void signOut().catch((e) =>
                          toast(errorMessage(e), "error"),
                        )
                      }
                    >
                      <LogOut size={17} />
                      Log out
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>
        <main id="main" className="page-content">
          {preview && <PreviewNote />}
          <Suspense fallback={<Loading />}>
            <Outlet />
          </Suspense>
          <footer className="workspace-footer">
            <span>Made for people. Built for good work.</span>
            <span>
              Tekzenit <span className="footer-dot">●</span>{" "}
              {preview ? "Design preview" : "Your connected workspace"}
            </span>
          </footer>
        </main>
        <button
          className="assistant-fab"
          onClick={openAssistant}
        >
          <Sparkles size={18} />
          <span>
            Ask Jarvis
          </span>
        </button>
      </div>
      {introVisible && <JarvisIntro onReveal={()=>setAssistant(true)} onDone={()=>setIntroVisible(false)}/>}
      <Suspense fallback={null}>
        {assistant && <JarvisOverlay introReveal={introReveal} onCommandReceived={() => setJarvisBlur(false)} onClose={() => setAssistant(false)} openJira={() => setJira(true)} />}
      </Suspense>
      <Suspense fallback={null}>
        <JiraPanel
          open={jira}
          onClose={() => setJira(false)}
          preview={preview}
        />
      </Suspense>
      <Modal
        open={notification}
        onClose={() => setNotification(false)}
        title="Your updates"
        description="Good to know, all in one place."
      >
        {member?.role !== "employee" && (
          <Link
            className="button secondary"
            to={`${base}/approvals`}
            onClick={() => setNotification(false)}
          >
            <CheckCheck size={17} />
            Review team requests
          </Link>
        )}
        {n.error ? (
          <ErrorState error={n.error} />
        ) : !n.data?.length ? (
          <EmptyState
            title="A little peace and quiet"
            description="Approvals and important workspace updates will appear here."
          />
        ) : (
          <>
            <button
              className="text-button"
              onClick={async () => {
                try {
                  await rpc("mark_notifications_read");
                  void qc.invalidateQueries({ queryKey: ["notifications"] });
                } catch (e) {
                  toast(errorMessage(e), "error");
                }
              }}
            >
              Mark all as read
            </button>
            {n.data.map((v) => (
              <div
                className={`notification-item ${v.read_at ? "" : "unread"}`}
                key={v.id}
              >
                <strong>{v.title}</strong>
                <p>{v.body}</p>
                {v.note_id && (
                  <Link
                    className="text-button"
                    to={`${base}/documents?note=${encodeURIComponent(v.note_id)}`}
                    onClick={() => setNotification(false)}
                  >
                    Open shared note
                  </Link>
                )}
                <small>{new Date(v.created_at).toLocaleString()}</small>
              </div>
            ))}
          </>
        )}
      </Modal>
      <Modal
        open={command}
        onClose={() => setCommand(false)}
        title="Where would you like to go?"
        description="Jump straight to your next task."
      >
        <div className="search-field command-search">
          <Search size={18} />
          <input
            autoFocus
            aria-label="Search pages"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search pages…"
          />
        </div>
        <div className="command-list">
          {links
            .filter((l) => l.label.toLowerCase().includes(search.toLowerCase()))
            .map(({ path, label, icon: Icon }) => (
              <Link
                to={`${base}/${path}`}
                onClick={() => setCommand(false)}
                key={path}
              >
                <Icon size={18} />
                {label}
                <ArrowUpRight size={16} />
              </Link>
            ))}
        </div>
      </Modal>
    </div>
  );
}
