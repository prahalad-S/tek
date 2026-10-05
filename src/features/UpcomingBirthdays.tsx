import { useQuery } from "@tanstack/react-query";
import { Cake, CalendarDays } from "lucide-react";
import { useAuth } from "../app/providers";
import { rpc } from "../lib/api";
type Birthday = { user_id: string; full_name: string; birthday: string };
const dateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
export default function UpcomingBirthdays() {
  const { preview } = useAuth();
  const now = new Date(),
    today = dateKey(now),
    end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 30),
    until = dateKey(end);
  const q = useQuery({
    queryKey: ["upcoming-birthdays", today, preview],
    queryFn: async () => {
      if (preview)
        return [
          {
            user_id: "preview",
            full_name: "Jordan Lee",
            birthday: dateKey(
              new Date(now.getFullYear(), now.getMonth(), now.getDate() + 3),
            ),
          },
        ];
      const years = [...new Set([now.getFullYear(), end.getFullYear()])];
      const rows = (
        await Promise.all(
          years.map((year) =>
            rpc<Birthday[]>("calendar_birthdays", { p_year: year }),
          ),
        )
      ).flat();
      return rows
        .filter((row) => row.birthday >= today && row.birthday <= until)
        .sort(
          (a, b) =>
            a.birthday.localeCompare(b.birthday) ||
            a.full_name.localeCompare(b.full_name),
        );
    },
  });
  return (
    <section className="panel upcoming-birthdays">
      <div className="panel-heading">
        <div>
          <h2>
            <Cake size={20} /> Upcoming birthdays
          </h2>
          <p>A little celebration, over the next 30 days.</p>
        </div>
        <CalendarDays size={19} />
      </div>
      {q.isPending ? (
        <p className="muted" role="status">
          Loading birthdays…
        </p>
      ) : q.error ? (
        <p role="alert">
          Birthdays are unavailable.{" "}
          <button className="text-link" onClick={() => void q.refetch()}>
            Try again
          </button>
        </p>
      ) : !q.data?.length ? (
        <p className="muted">No upcoming birthdays to show.</p>
      ) : (
        <div className="birthday-roster">
          {q.data.map((person) => (
            <article key={person.user_id + person.birthday}>
              <span className="birthday-icon">
                <Cake size={19} />
              </span>
              <div>
                <strong>{person.full_name}</strong>
                <span>
                  {person.birthday === today
                    ? "Today 🎉"
                    : new Date(
                        person.birthday + "T12:00:00",
                      ).toLocaleDateString(undefined, {
                        month: "long",
                        day: "numeric",
                      })}
                </span>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
