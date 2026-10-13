import { useState } from "react";
import OrganisationChart from "./OrganisationChart";
import type { Employee } from "../../lib/types";
import { Avatar } from "../../components/ui";
export default function PeopleDataView({
  people,
  view,
  onSelect,
}: {
  people: Employee[];
  view: string;
  onSelect: (employee: Employee) => void;
}) {
  const [orgOpen,setOrgOpen]=useState(false);
  const groups = Object.entries(
    people.reduce<Record<string, number>>((counts, person) => {
      const name = person.departments?.name || "Unassigned";
      counts[name] = (counts[name] || 0) + 1;
      return counts;
    }, {}),
  );
  const colors = [
    "#e83b3b",
    "#258fbe",
    "#26a269",
    "#94633e",
    "#8272ca",
    "#db9b35",
  ];
  let position = 0;
  const gradient = groups
    .map(([, count], index) => {
      const start = position;
      position += (count / people.length) * 100;
      return `${colors[index % colors.length]} ${start}% ${position}%`;
    })
    .join(",");
  if (view === "chart")
    return (
      <section className="panel people-chart">
        <div>
          <h2>People by department</h2>
          <p>Based on your current filters.</p>
          <button type="button" className="button secondary" onClick={()=>setOrgOpen(true)}>Organisation chart</button>
        </div>
        <div className="people-chart-body">
          <div
            className="people-donut"
            role="img"
            aria-label={groups
              .map(([name, count]) => `${name}: ${count}`)
              .join(", ")}
            style={{ background: `conic-gradient(${gradient})` }}
          >
            <span>
              <strong>{people.length}</strong>people
            </span>
          </div>
          <ul>
            {groups.map(([name, count], index) => (
              <li key={name}>
                <i style={{ background: colors[index % colors.length] }} />
                {name}
                <strong>{count}</strong>
              </li>
            ))}
          </ul>
        </div>
        {orgOpen && <OrganisationChart people={people} onClose={()=>setOrgOpen(false)} onSelect={onSelect}/>}
      </section>
    );
  return (
    <div className="panel people-table">
      <table>
        <thead>
          <tr>
            <th>Employee</th>
            <th>Department</th>
            <th>Location</th>
            <th>Joined</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {people.map((person) => (
            <tr key={person.id}>
              <td>
                <button
                  className="people-table-person"
                  onClick={() => onSelect(person)}
                >
                  <Avatar person={person} />
                  <span>
                    <strong>{person.full_name}</strong>
                    <small>{person.title || "Team member"}</small>
                  </span>
                </button>
              </td>
              <td>{person.departments?.name || "—"}</td>
              <td>{person.location || "—"}</td>
              <td>{person.joined_on || "—"}</td>
              <td>{person.departure_status || "Active"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
