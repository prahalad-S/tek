import tekzenitLogo from "../assets/images/tekzenit_logo.svg";
import * as Dialog from "@radix-ui/react-dialog";
import {
  X,
  ArrowUpRight,
  AlertCircle,
  LoaderCircle,
  SearchX,
  Sparkles,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import {
  createContext,
  useContext,
  useState,
  useRef,
  type ReactNode,
  Component,
} from "react";
import { initials, errorMessage } from "../lib/domain";
import { signedUrl } from "../lib/api";
import type { Employee } from "../lib/types";
export function Brand() {
  return (
    <span className="brand">
      <img
        className="brand-logo"
        src={tekzenitLogo}
        alt="Tekzenit"
        width="135"
        height="25"
      />
    </span>
  );
}
export function Avatar({
  person,
  size = "medium",
}: {
  person: Pick<Employee, "full_name" | "avatar_path"> &
    Partial<Pick<Employee, "departments">>;
  size?: string;
}) {
  const [photoOpen, setPhotoOpen] = useState(false);
  const origin = useRef<DOMRect | null>(null);
  const photo = useRef<HTMLImageElement | null>(null);
  const closing = useRef(false);
  const transformFromAvatar = (image: HTMLImageElement) => {
    const source = origin.current;
    const target = image.getBoundingClientRect();
    if (!source) return "none";
    return `translate(${source.x + source.width / 2 - target.x - target.width / 2}px, ${source.y + source.height / 2 - target.y - target.height / 2}px) scale(${source.width / target.width})`;
  };
  const closePhoto = () => {
    if (closing.current) return;
    const image = photo.current;
    if (
      !image ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setPhotoOpen(false);
      return;
    }
    closing.current = true;
    image
      .animate(
        [
          { transform: "none", borderRadius: "16px" },
          { transform: transformFromAvatar(image), borderRadius: "50%" },
        ],
        { duration: 250, easing: "linear", fill: "forwards" },
      )
      .finished.then(() => {
        setPhotoOpen(false);
        closing.current = false;
      })
      .catch(() => {
        closing.current = false;
      });
  };
  const q = useQuery({
    queryKey: ["avatar", person.avatar_path],
    queryFn: () => signedUrl("avatars", person.avatar_path!),
    enabled: !!person.avatar_path,
    staleTime: 90000,
  });
  const hue =
    [...person.full_name].reduce((a, c) => a + c.charCodeAt(0), 0) % 6;
  const department = person.departments?.name || "";
  const colors: Record<string, string> = {
    "creative services": "#e83b3b",
    design: "#e83b3b",
    development: "#258fbe",
    engineering: "#258fbe",
    administration: "#26a269",
    operations: "#26a269",
    netsys: "#94633e",
  };
  const color = colors[department.toLowerCase()] || "#8272ca";
  const portrait = (
    <span className={`avatar avatar--${size} avatar--${hue}`}>
      {q.data ? <img src={q.data} alt="" /> : initials(person.full_name)}
      {department && (
        <span
          className="department-dot"
          style={{ backgroundColor: color }}
          title={department}
          aria-label={`Department: ${department}`}
        />
      )}
    </span>
  );
  return (
    <>
      {size === "hero" && q.data ? (
        <button
          type="button"
          className="profile-photo-trigger"
          aria-label={`Enlarge photo of ${person.full_name}`}
          onClick={(event) => {
            origin.current = (
              event.currentTarget.querySelector("img") || event.currentTarget
            ).getBoundingClientRect();
            setPhotoOpen(true);
          }}
        >
          {portrait}
        </button>
      ) : (
        portrait
      )}
      {photoOpen && (
        <Dialog.Root
          open={photoOpen}
          onOpenChange={(open) => {
            if (!open) closePhoto();
          }}
        >
          <Dialog.Portal>
            <Dialog.Overlay className="modal-overlay photo-lightbox-overlay" />
            <Dialog.Content
              className="photo-lightbox"
              aria-describedby={undefined}
              onOpenAutoFocus={() => {
                // Radix must finish placing its portal before measuring the destination.
                requestAnimationFrame(() =>
                  requestAnimationFrame(async () => {
                    const image = photo.current;
                    if (!image || closing.current) return;
                    try {
                      await image.decode();
                    } catch {
                      /* Keep the loaded avatar fallback. */
                    }
                    if (!image.isConnected || closing.current) return;
                    const start = transformFromAvatar(image);
                    image.style.visibility = "visible";
                    if (
                      !window.matchMedia("(prefers-reduced-motion: reduce)")
                        .matches
                    ) {
                      image.animate(
                        [
                          { transform: start, borderRadius: "50%" },
                          { transform: "none", borderRadius: "16px" },
                        ],
                        { duration: 250, easing: "linear", fill: "both" },
                      );
                    }
                  }),
                );
              }}
            >
              <Dialog.Title className="sr-only">
                {person.full_name} — profile photo
              </Dialog.Title>
              <Dialog.Close className="icon-button" aria-label="Close photo">
                <X size={24} />
              </Dialog.Close>
              <img
                src={q.data}
                alt={person.full_name}
                style={{ visibility: "hidden" }}
                ref={photo}
              />
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      )}
    </>
  );
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay" />
        <Dialog.Content className={`modal ${wide ? "modal--wide" : ""}`}>
          <div className="modal-heading">
            <div>
              <Dialog.Title>{title}</Dialog.Title>
              <Dialog.Description>
                {description || "Review the details below."}
              </Dialog.Description>
            </div>
            <Dialog.Close className="icon-button" aria-label="Close dialog">
              <X size={20} />
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>
          {title}
          <span className="title-dot">.</span>
        </h1>
        <p>{description}</p>
      </div>
      <div className="heading-actions">{actions}</div>
    </div>
  );
}
export function Loading() {
  return (
    <div className="loading-state" role="status">
      <LoaderCircle className="spin" size={22} />
      Loading your workspace…
    </div>
  );
}
export function ErrorState({
  error,
  retry,
}: {
  error: unknown;
  retry?: () => void;
}) {
  return (
    <div className="error-state" role="alert">
      <AlertCircle size={22} />
      <div>
        <strong>We couldn’t load this just yet</strong>
        <p>{errorMessage(error)}</p>
        {retry && (
          <button className="button secondary" onClick={retry}>
            Try again
          </button>
        )}
      </div>
    </div>
  );
}
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <SearchX size={28} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return <span className={`badge badge--${tone}`}>{children}</span>;
}
export function Stat({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: ReactNode;
  detail: string;
  icon: ReactNode;
}) {
  return (
    <div className="stat-card">
      <div className="stat-top">
        <span>{label}</span>
        <span className="stat-icon">{icon}</span>
      </div>
      <strong>{value}</strong>
      <div className="stat-detail">{detail}</div>
    </div>
  );
}
export function SectionTitle({
  title,
  aside,
}: {
  title: string;
  aside?: ReactNode;
}) {
  return (
    <div className="section-title">
      <h2>{title}</h2>
      {aside}
    </div>
  );
}
export function PreviewNote() {
  return (
    <span className="preview-note">
      <Sparkles size={13} />
      Design preview · fictional data · no database changes
    </span>
  );
}
const ToastContext = createContext<
  (message: string, tone?: "success" | "error") => void
>(() => {});
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ message: string; tone: string } | null>(
    null,
  );
  return (
    <ToastContext.Provider
      value={(message, tone = "success") => {
        setToast({ message, tone });
        window.setTimeout(
          () => setToast((t) => (t?.message === message ? null : t)),
          6000,
        );
      }}
    >
      {children}
      {toast && (
        <div
          className={`toast toast--${toast.tone}`}
          role={toast.tone === "error" ? "alert" : "status"}
        >
          {toast.message}
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast(null)}
          >
            <X size={16} />
          </button>
        </div>
      )}
    </ToastContext.Provider>
  );
}
export const useToast = () => useContext(ToastContext);
export class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <main className="fatal">
        <h1>Let’s get you back on track.</h1>
        <p>This page encountered an unexpected error.</p>
        <button className="button" onClick={() => window.location.reload()}>
          Reload workspace <ArrowUpRight size={16} />
        </button>
      </main>
    ) : (
      this.props.children
    );
  }
}
