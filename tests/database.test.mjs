import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";
const db = new PGlite();
const ids = {
  a: "00000000-0000-4000-a000-000000000001",
  b: "00000000-0000-4000-a000-000000000002",
  manager: "00000000-0000-4000-a000-000000000003",
  admin: "00000000-0000-4000-a000-000000000004",
  outsider: "00000000-0000-4000-a000-000000000005",
};
const d1 = "10000000-0000-4000-a000-000000000001",
  d2 = "10000000-0000-4000-a000-000000000002",
  project = "20000000-0000-4000-a000-000000000001";
let sheetId, entryId, week;
async function as(id) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  await db.exec("set role authenticated");
}
async function q(sql, args = []) {
  return (await db.query(sql, args)).rows;
}
before(async () => {
  await db.exec(
    `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;create function storage.foldername(name text) returns text[] language sql as $$select string_to_array(name,'/')$$;grant usage on schema storage to authenticated;grant select,insert,delete on storage.objects to authenticated;`,
  );
  for (const file of fs
    .readdirSync("supabase/migrations")
    .filter(
      (f) => !process.env.TEST_UPDATE_BUNDLE || Number(f.slice(9, 12)) <= 5,
    )
    .sort())
    await db.exec(
      fs
        .readFileSync("supabase/migrations/" + file, "utf8")
        .replace(/^\uFEFF/, ""),
    );
  if (process.env.TEST_UPDATE_BUNDLE) {
    const bundle = fs.readFileSync("../Tekzenit-workspace-update.sql", "utf8");
    await db.exec(bundle);
    await db.exec(bundle);
  }
  await db.query(
    "insert into public.departments(id,name) values($1,$2),($3,$4)",
    [d1, "Design", d2, "Engineering"],
  );
  for (const [k, id] of Object.entries(ids)) {
    await db.query("insert into auth.users values($1,$2,now())", [
      id,
      `${k}@example.test`,
    ]);
    if (k === "outsider") continue;
    await db.query(
      "insert into public.employees(email,full_name,department_id) values($1,$2,$3)",
      [`${k}@example.test`, k, k === "b" ? d2 : d1],
    );
    await db.query("insert into private.allowed_emails(email) values($1)", [
      `${k}@example.test`,
    ]);
  }
  await db.query("insert into public.projects(id,name) values($1,$2)", [
    project,
    "Test project",
  ]);
  for (const [k, id] of Object.entries(ids)) {
    if (k === "outsider") continue;
    await as(id);
    await db.exec("select public.claim_profile()");
  }
  await db.exec("reset role");
  await db.query(
    "update public.memberships set role='manager' where user_id=$1",
    [ids.manager],
  );
  await db.query(
    "update public.memberships set role='admin' where user_id=$1",
    [ids.admin],
  );
  week = (
    await q("select date_trunc('week',current_date)::date::text as week")
  )[0].week;
  await db.query(
    "insert into public.calendar_access_requests(user_id,from_date,to_date,reason,status,expires_at) values($1,$2::date,$2::date+6,'Test fixture grant','approved',now()+interval '1 day')",
    [ids.a, week],
  );
});
after(() => db.close());
test("unprovisioned users cannot claim accounts or read directory", async () => {
  await as(ids.outsider);
  await assert.rejects(db.exec("select public.claim_profile()"), /provisioned/);
  assert.equal((await q("select * from public.employees")).length, 0);
});
test("anonymous access cannot read employee records", async () => {
  await db.exec("reset role;set role anon");
  await assert.rejects(
    db.exec("select * from public.employees"),
    /permission denied/,
  );
});
test("self profile editing accepts a new employee code without granting privileges", async () => {
  await as(ids.a);
  await db.query("select public.update_my_profile($1,$2,$3,$4,$5,$6)", [
    "Alice",
    "E0099",
    "Remote",
    "Hello",
    "555",
    "Private address",
  ]);
  assert.equal(
    (await q("select role from public.memberships"))[0].role,
    "employee",
  );
  await assert.rejects(
    db.exec("update public.memberships set role='admin'"),
    /permission denied/,
  );
  await assert.rejects(
    db.exec("update public.employees set title='CEO'"),
    /permission denied/,
  );
});
test("private fields and storage are isolated from other employees", async () => {
  await as(ids.a);
  await db.query(
    "insert into storage.objects(bucket_id,name) values('employee-documents',$1)",
    [ids.a + "/test.pdf"],
  );
  await as(ids.b);
  assert.equal(
    (await q("select * from public.employee_private_details")).length,
    0,
  );
  assert.equal(
    (
      await q(
        "select * from storage.objects where bucket_id='employee-documents'",
      )
    ).length,
    0,
  );
  await assert.rejects(
    db.query(
      "insert into storage.objects(bucket_id,name) values('avatars',$1)",
      [ids.a + "/forged.jpg"],
    ),
    /row-level security/,
  );
});
test("draft entries validate dates, total duration and concurrency", async () => {
  await as(ids.a);
  sheetId = (
    await q("select (public.get_or_create_timesheet($1)).id as id", [week])
  )[0].id;
  entryId = (
    await q("select public.save_time_entry($1,$2,$3,$4,$5) as id", [
      sheetId,
      week,
      project,
      "Design work",
      120,
    ])
  )[0].id;
  await assert.rejects(
    db.query("select public.save_time_entry($1,$2,$3,$4,$5)", [
      sheetId,
      week,
      project,
      "Too much",
      1400,
    ]),
    /24 hours/,
  );
  await assert.rejects(
    db.query("select public.save_time_entry($1,$2,$3,$4,$5,$6,$7)", [
      sheetId,
      week,
      project,
      "Conflict",
      60,
      entryId,
      99,
    ]),
    /Entry changed/,
  );
  await assert.rejects(
    db.query("select public.save_time_entry($1,$2::date+7,$3,$4,$5)", [
      sheetId,
      week,
      project,
      "Wrong week",
      60,
    ]),
    /inside the selected week/,
  );
});
test("cross-user timesheet mutation is blocked at the database", async () => {
  await as(ids.b);
  assert.equal((await q("select * from public.time_entries")).length, 0);
  await assert.rejects(
    db.query("select public.save_time_entry($1,$2,$3,$4,$5)", [
      sheetId,
      week,
      project,
      "Foreign edit",
      60,
    ]),
    /cannot be edited/,
  );
});
test("assistant confirmation is owner-bound and idempotent", async () => {
  await as(ids.a);
  const action = (
    await q("select public.propose_agent_entry($1) as id", [
      {
        sheet_id: sheetId,
        date: week,
        project_id: project,
        description: "Reviewed work",
        minutes: 30,
      },
    ])
  )[0].id;
  await as(ids.b);
  await assert.rejects(
    db.query("select public.confirm_agent_action($1)", [action]),
    /not found/,
  );
  await as(ids.a);
  const first = (
    await q("select public.confirm_agent_action($1) as id", [action])
  )[0].id;
  const second = (
    await q("select public.confirm_agent_action($1) as id", [action])
  )[0].id;
  assert.equal(first, second);
  assert.equal((await q("select * from public.time_entries")).length, 2);
});
test("assistant rejects proposals after the timesheet changes", async () => {
  await as(ids.a);
  const action = (
    await q("select public.propose_agent_entry($1) as id", [
      {
        sheet_id: sheetId,
        date: week,
        project_id: project,
        description: "Stale work",
        minutes: 30,
      },
    ])
  )[0].id;
  await db.query("select public.save_time_entry($1,$2,$3,$4,$5)", [
    sheetId,
    week,
    project,
    "New work",
    30,
  ]);
  await assert.rejects(
    db.query("select public.confirm_agent_action($1)", [action]),
    /timesheet changed/,
  );
});
test("submission review is scoped; subsequent edits reopen an approved timesheet", async () => {
  await as(ids.a);
  const version = (
    await q("select version from public.timesheets where id=$1", [sheetId])
  )[0].version;
  await db.query("select public.submit_timesheet($1,$2)", [sheetId, version]);
  await assert.rejects(
    db.query("select public.review_timesheet($1,$2,true)", [
      sheetId,
      version + 1,
    ]),
    /not permitted/,
  );
  await as(ids.b);
  await assert.rejects(
    db.query("select public.review_timesheet($1,$2,true)", [
      sheetId,
      version + 1,
    ]),
    /not permitted/,
  );
  await as(ids.manager);
  await db.query("select public.review_timesheet($1,$2,true)", [
    sheetId,
    version + 1,
  ]);
  assert.equal(
    (await q("select status from public.timesheets where id=$1", [sheetId]))[0]
      .status,
    "approved",
  );
  await as(ids.a);
  await db.query("select public.save_time_entry($1,$2,$3,'Reopened edit',60)", [
    sheetId,
    week,
    project,
  ]);
  assert.equal(
    (await q("select status from public.timesheets where id=$1", [sheetId]))[0]
      .status,
    "draft",
  );
});
test("leave approval updates the real request and persists a notification", async () => {
  await as(ids.a);
  const id = (
    await q("select public.request_leave($1,$1,$2) as id", [week, "A day away"])
  )[0].id;
  await as(ids.manager);
  await db.query("select public.review_leave($1,true)", [id]);
  await as(ids.a);
  assert.equal(
    (await q("select status from public.leave_requests where id=$1", [id]))[0]
      .status,
    "approved",
  );
  assert.ok((await q("select * from public.notifications")).length >= 2);
});
test("blocking an account immediately removes data and mutation access", async () => {
  await as(ids.admin);
  await db.query("select public.manage_membership($1,$2,false)", [
    ids.b,
    "employee",
  ]);
  await as(ids.b);
  assert.equal((await q("select * from public.employees")).length, 0);
  await assert.rejects(db.exec("select public.claim_profile()"), /disabled/);
  await assert.rejects(
    db.query("select public.get_or_create_timesheet($1)", [week]),
    /not available/,
  );
});
test("administrators cannot disable themselves; import endpoint is server-only", async () => {
  await as(ids.admin);
  await assert.rejects(
    db.query("select public.manage_membership($1,$2,false)", [
      ids.admin,
      "employee",
    ]),
    /own access/,
  );
  await as(ids.a);
  await assert.rejects(
    db.query("select public.provision_imported_emails($1)", [[]]),
    /permission denied/,
  );
});

test("unverified provisioned email cannot claim an employee", async () => {
  await db.exec("reset role");
  const id = "00000000-0000-4000-a000-000000000006";
  await db.query("insert into auth.users values($1,$2,null)", [
    id,
    "unverified@example.test",
  ]);
  await db.query(
    "insert into public.employees(email,full_name) values($1,$2)",
    ["unverified@example.test", "Unverified"],
  );
  await db.query("insert into private.allowed_emails(email) values($1)", [
    "unverified@example.test",
  ]);
  await as(id);
  await assert.rejects(db.exec("select public.claim_profile()"));
  assert.equal((await q("select * from public.memberships")).length, 0);
});
test("cancelled and expired assistant proposals cannot mutate time entries", async () => {
  await as(ids.manager);
  const payload = {
    date: week,
    project_id: project,
    description: "Unconfirmed",
    minutes: 30,
  };
  const id = (
    await q("select public.propose_agent_entry($1) as id", [payload])
  )[0].id;
  assert.equal(
    (await q("select * from public.timesheets where user_id=$1", [ids.manager]))
      .length,
    0,
  );
  await db.query("select public.cancel_agent_action($1)", [id]);
  await assert.rejects(
    db.query("select public.confirm_agent_action($1)", [id]),
    /expired or cancelled/,
  );
  const expired = (
    await q("select public.propose_agent_entry($1) as id", [payload])
  )[0].id;
  await db.exec("reset role");
  await db.query(
    "update public.agent_actions set expires_at=now()-interval '1 second' where id=$1",
    [expired],
  );
  await as(ids.manager);
  await assert.rejects(
    db.query("select public.confirm_agent_action($1)", [expired]),
    /expired or cancelled/,
  );
  assert.equal(
    (await q("select * from public.timesheets where user_id=$1", [ids.manager]))
      .length,
    0,
  );
});
test("calendar creation is restricted to managers and validates date order", async () => {
  await as(ids.a);
  await assert.rejects(
    db.query(
      "select public.create_calendar_item('event','Planning',now(),now()+interval '1 hour')",
    ),
    /Manager access/,
  );
  await as(ids.manager);
  await assert.rejects(
    db.query(
      "select public.create_calendar_item('event','Backwards',now(),now()-interval '1 hour')",
    ),
  );
  const created = await q(
    "select public.create_calendar_item('event','Planning',now(),now()+interval '1 hour') as id",
  );
  assert.ok(created[0].id);
});

test("project teams persist without permitting employee privilege escalation", async () => {
  await as(ids.a);
  await assert.rejects(
    db.query("select public.set_project_member($1,$2,true)", [project, ids.a]),
    /Manager access/,
  );
  await as(ids.manager);
  await db.query("select public.set_project_member($1,$2,true)", [
    project,
    ids.a,
  ]);
  await db.query("select public.set_project_member($1,$2,true)", [
    project,
    ids.a,
  ]);
  assert.equal(
    (
      await q(
        "select * from public.project_memberships where project_id=$1 and user_id=$2",
        [project, ids.a],
      )
    ).length,
    1,
  );
  await assert.rejects(
    db.query("select public.set_project_member($1,$2,true)", [
      project,
      ids.outsider,
    ]),
    /active employee/,
  );
  await db.query("select public.set_project_member($1,$2,false)", [
    project,
    ids.a,
  ]);
  assert.equal(
    (
      await q("select * from public.project_memberships where project_id=$1", [
        project,
      ])
    ).length,
    0,
  );
});

test("calendar date window is enforced through both calendar and legacy timesheet commands", async () => {
  await db.exec("reset role");
  const old = (await q("select (private.calendar_today()-30)::text as d"))[0].d;
  await as(ids.a);
  await assert.rejects(
    db.query("select public.save_calendar_entry($1,$2,$3,$4,60)", [
      ids.a,
      old,
      project,
      "Late entry",
    ]),
    /Restricted date/,
  );
  const sheet = (
    await q(
      "select (public.get_or_create_timesheet(date_trunc('week',$1::date)::date)).id as id",
      [old],
    )
  )[0].id;
  await assert.rejects(
    db.query("select public.save_time_entry($1,$2,$3,$4,60)", [
      sheet,
      old,
      project,
      "Legacy bypass",
    ]),
    /Restricted date/,
  );
  await assert.rejects(
    db.query("select public.grant_calendar_access($1,$2,$2,$3)", [
      [ids.a],
      old,
      "Self grant",
    ]),
    /not permitted/,
  );
  const request = (
    await q("select public.request_calendar_access($1,$1,$2) as id", [
      old,
      "Forgot to log work",
    ])
  )[0].id;
  await assert.rejects(
    db.query("select public.review_calendar_access($1,true)", [request]),
    /not permitted/,
  );
  await as(ids.manager);
  await db.query("select public.review_calendar_access($1,true)", [request]);
  await as(ids.a);
  await db.query("select public.save_calendar_entry($1,$2,$3,$4,60)", [
    ids.a,
    old,
    project,
    "Granted entry",
  ]);
  await db.exec("reset role");
  await db.query(
    "update public.calendar_access_requests set expires_at=now()-interval '1 second' where id=$1",
    [request],
  );
  await as(ids.a);
  await assert.rejects(
    db.query("select public.save_calendar_entry($1,$2,$3,$4,60)", [
      ids.a,
      old,
      project,
      "Expired grant",
    ]),
    /Restricted date/,
  );
});
test("calendar move, copy and repeat operate across weeks and preserve optimistic concurrency", async () => {
  await db.exec("reset role");
  const date = (await q("select (private.calendar_today()+14)::text as d"))[0]
    .d;
  await as(ids.a);
  const id = (
    await q(
      "select public.save_calendar_entry($1,$2,$3,'Calendar task',60,'Completed') as id",
      [ids.a, date, project],
    )
  )[0].id;
  await db.query(
    "select public.calendar_entry_action($1,1,'move',$2::date+7)",
    [id, date],
  );
  assert.equal(
    (await q("select version from public.time_entries where id=$1", [id]))[0]
      .version,
    2,
  );
  await assert.rejects(
    db.query("select public.calendar_entry_action($1,1,'delete')", [id]),
    /changed/,
  );
  await db.query(
    "select public.calendar_entry_action($1,2,'copy',$2::date+8)",
    [id, date],
  );
  await db.query(
    "select public.calendar_entry_action($1,2,'extend',$2::date+9)",
    [id, date],
  );
  const count = (
    await q(
      "select count(*)::int as n from public.time_entries where description='Calendar task'",
    )
  )[0].n;
  assert.equal(count, 4);
  await db.query("select public.calendar_entry_action($1,2,'delete')", [id]);
  assert.equal(
    (await q("select * from public.time_entries where id=$1", [id])).length,
    0,
  );
});
test("manager assignment is scoped to active employees in their department", async () => {
  await db.exec("reset role");
  const date = (await q("select private.calendar_today()::text as d"))[0].d;
  await as(ids.manager);
  await assert.rejects(
    db.query(
      "select public.save_calendar_entry($1,$2,$3,'Unauthorized assignment',60)",
      [ids.b, date, project],
    ),
    /not permitted/,
  );
  await db.query(
    "select public.save_calendar_entry($1,$2::date+40,$3,'Assigned with audit',60)",
    [ids.a, date, project],
  );
  await as(ids.a);
  assert.equal(
    (
      await q(
        "select * from public.time_entries where description='Assigned with audit'",
      )
    ).length,
    1,
  );
});
test("multi-day half-day leave remains pending and cannot be changed after approval", async () => {
  await db.exec("reset role");
  const date = (await q("select (private.calendar_today()+45)::text as d"))[0]
    .d;
  await as(ids.a);
  const id = (
    await q(
      "select public.save_calendar_leave($1,$2,$2::date+2,'Medical visit','Sick',240) as id",
      [ids.a, date],
    )
  )[0].id;
  let row = (
    await q("select * from public.leave_requests where id=$1", [id])
  )[0];
  assert.equal(row.status, "pending");
  assert.equal(row.daily_minutes, 240);
  await as(ids.manager);
  await db.query("select public.review_leave($1,true)", [id]);
  await as(ids.a);
  await assert.rejects(
    db.query("select public.delete_calendar_leave($1,1)", [id]),
    /unavailable/,
  );
  await assert.rejects(
    db.query(
      "select public.save_calendar_leave($1,$2,$2,'Changed','Sick',480,$3,1)",
      [ids.a, date, id],
    ),
    /approved/,
  );
});
test("professional profile edits persist normalized rows and reject another employee edit", async () => {
  await as(ids.a);
  const employee = (
    await q("select id from public.employees where user_id=$1", [ids.a])
  )[0].id;
  const args = [
    employee,
    {
      summary: "Test summary",
      languages: ["English"],
      joined_on: "2020-03-01",
      employment_status: "Active",
    },
    [
      {
        company: "Test company",
        role: "Designer",
        start_date: "2019-01-01",
        end_date: "2020-01-01",
        description: "Real experience",
      },
    ],
    [
      {
        institution: "Test university",
        qualification: "Degree",
        start_year: 2015,
        end_year: 2018,
      },
    ],
    [
      {
        kind: "award",
        title: "Test award",
        description: "Achievement",
        url: "",
      },
    ],
    ["Design", "Research"],
    { dob: "1990-01-01", pan: "PRIVATE-ID" },
  ];
  await db.query(
    "select public.save_extended_profile($1,$2,$3,$4,$5,$6,$7)",
    args,
  );
  assert.equal(
    (
      await q("select * from public.employee_experience where employee_id=$1", [
        employee,
      ])
    ).length,
    1,
  );
  assert.equal(
    (
      await q("select * from public.employee_education where employee_id=$1", [
        employee,
      ])
    ).length,
    1,
  );
  await as(ids.manager);
  await assert.rejects(
    db.query("select public.save_extended_profile($1,$2,$3,$4,$5,$6,$7)", args),
    /not permitted/,
  );
  assert.equal(
    (
      await q(
        "select * from public.employee_private_details where user_id=$1",
        [ids.a],
      )
    ).length,
    0,
  );
  await as(ids.admin);
  assert.equal(
    (
      await q(
        "select pan from public.employee_private_details where user_id=$1",
        [ids.a],
      )
    )[0].pan,
    "PRIVATE-ID",
  );
});
test("offer letters and personal storage objects are private while resumes are shared", async () => {
  await as(ids.a);
  for (const category of ["offer_letter", "resume"]) {
    const path = ids.a + "/" + category + ".pdf";
    await db.query(
      "insert into storage.objects(bucket_id,name) values('employee-documents',$1)",
      [path],
    );
    await db.query(
      "select public.register_profile_document($1,$2,$3,'application/pdf',100,$4)",
      [ids.a, category + ".pdf", path, category],
    );
  }
  await as(ids.manager);
  let files = await q(
    "select category from public.employee_documents where user_id=$1",
    [ids.a],
  );
  assert.deepEqual(
    files.map((f) => f.category),
    ["resume"],
  );
  let objects = await q(
    "select name from storage.objects where bucket_id='employee-documents'",
  );
  assert.ok(objects.some((o) => o.name.endsWith("resume.pdf")));
  assert.ok(!objects.some((o) => o.name.endsWith("offer_letter.pdf")));
  await as(ids.admin);
  files = await q(
    "select category from public.employee_documents where user_id=$1",
    [ids.a],
  );
  assert.equal(files.length, 2);
  assert.ok(
    (
      await q(
        "select name from storage.objects where bucket_id='employee-documents'",
      )
    ).some((o) => o.name.endsWith("offer_letter.pdf")),
  );
});
test("team events are scoped; managers cannot change company-wide announcements", async () => {
  await as(ids.admin);
  const company = (
    await q("select public.save_calendar_item('holiday',$1) as id", [
      { name: "Company day", day: "2026-12-30" },
    ])
  )[0].id;
  await as(ids.manager);
  await assert.rejects(
    db.query("select public.delete_calendar_item('holiday',$1)", [company]),
    /unavailable/,
  );
  const team = (
    await q("select public.save_calendar_item('holiday',$1) as id", [
      { name: "Design day", day: "2026-12-29" },
    ])
  )[0].id;
  assert.equal(
    (
      await q("select department_id from public.holidays where id=$1", [team])
    )[0].department_id,
    d1,
  );
  await db.exec("reset role");
  await db.query("update public.memberships set active=true where user_id=$1", [
    ids.b,
  ]);
  await as(ids.b);
  assert.equal(
    (await q("select * from public.holidays where id=$1", [team])).length,
    0,
  );
  assert.equal(
    (await q("select * from public.holidays where id=$1", [company])).length,
    1,
  );
});

test("leave moves, copies and extension preserve review status and enforce overlap limits", async () => {
  await db.exec("reset role");
  const date = (await q("select (private.calendar_today()+90)::text as d"))[0]
    .d;
  await as(ids.a);
  const id = (
    await q(
      "select public.save_calendar_leave($1,$2,$2::date+1,'Planned break','Casual',480) as id",
      [ids.a, date],
    )
  )[0].id;
  await db.query(
    "select public.calendar_leave_action($1,1,'move',$2::date+4)",
    [id, date],
  );
  await db.query(
    "select public.calendar_leave_action($1,2,'extend',$2::date+6)",
    [id, date],
  );
  const row = (
    await q("select * from public.leave_requests where id=$1", [id])
  )[0];
  assert.equal(row.version, 3);
  assert.equal(row.status, "pending");
  await assert.rejects(
    db.query("select public.calendar_leave_action($1,3,'copy',$2::date+4)", [
      id,
      date,
    ]),
    /overlap/,
  );
  await db.query(
    "select public.calendar_leave_action($1,3,'copy',$2::date+10)",
    [id, date],
  );
  assert.equal(
    (
      await q(
        "select * from public.leave_requests where reason='Planned break'",
      )
    ).length,
    2,
  );
});

test("combined work and approved half-day leave cannot exceed 24 hours in either write order", async () => {
  await db.exec("reset role");
  const date = (await q("select (private.calendar_today()+120)::text as d"))[0]
    .d;
  await as(ids.a);
  const first = (
    await q(
      "select public.save_calendar_leave($1,$2,$2,'First half','Casual',240) as id",
      [ids.a, date],
    )
  )[0].id;
  const second = (
    await q(
      "select public.save_calendar_leave($1,$2,$2,'Second half','Casual',240) as id",
      [ids.a, date],
    )
  )[0].id;
  await as(ids.manager);
  await db.query("select public.review_leave($1,true)", [first]);
  await as(ids.a);
  await db.query(
    "select public.save_calendar_entry($1,$2,$3,'Long shift',1200)",
    [ids.a, date, project],
  );
  await assert.rejects(
    db.query("select public.save_calendar_entry($1,$2,$3,'Extra time',15)", [
      ids.a,
      date,
      project,
    ]),
    /24 hours/,
  );
  await as(ids.manager);
  await assert.rejects(
    db.query("select public.review_leave($1,true)", [second]),
    /24 hours/,
  );
});

test("calendar undo reverses repeated dates atomically and rejects a concurrent edit", async () => {
  await db.exec("reset role");
  const date = (await q("select (private.calendar_today()+180)::text d"))[0].d;
  await as(ids.a);
  const id = (
    await q("select public.save_calendar_entry($1,$2,$3,'Undo source',60) id", [
      ids.a,
      date,
      project,
    ])
  )[0].id;
  await db.query(
    "select public.calendar_entry_action($1,1,'extend',$2::date+3)",
    [id, date],
  );
  assert.equal(
    (
      await q(
        "select * from public.time_entries where description='Undo source'",
      )
    ).length,
    4,
  );
  await db.exec("select public.undo_calendar_change()");
  assert.equal(
    (
      await q(
        "select * from public.time_entries where description='Undo source'",
      )
    ).length,
    1,
  );
  await db.exec("select public.undo_calendar_change()");
  assert.equal(
    (
      await q(
        "select * from public.time_entries where description='Undo source'",
      )
    ).length,
    0,
  );
  const conflict = (
    await q(
      "select public.save_calendar_entry($1,$2,$3,'Concurrent undo',60) id",
      [ids.a, date, project],
    )
  )[0].id;
  await as(ids.manager);
  await db.query(
    "select public.save_calendar_entry($1,$2,$3,'Changed by manager',120,'Completed',$4,1)",
    [ids.a, date, project, conflict],
  );
  await as(ids.a);
  await assert.rejects(
    db.exec("select public.undo_calendar_change()"),
    /changed since/,
  );
});
test("elapsed pending leave auto-approves once and sends a happy notification", async () => {
  await db.exec("reset role");
  const date = (await q("select (private.calendar_today()-150)::text d"))[0].d;
  await as(ids.manager);
  await q("select public.grant_calendar_access($1,$2,$2,$3)", [
    [ids.a],
    date,
    "Historical policy test",
  ]);
  const id = (
    await q(
      "select public.save_calendar_leave($1,$2,$2,'Elapsed policy','Casual',240) id",
      [ids.a, date],
    )
  )[0].id;
  const future = (
    await q(
      "select public.save_calendar_leave($1,$2::date+360,$2::date+360,'Future policy','Casual',240) id",
      [ids.a, date],
    )
  )[0].id;
  await as(ids.a);
  await db.exec("select public.process_elapsed_leave()");
  assert.equal(
    (await q("select status from public.leave_requests where id=$1", [id]))[0]
      .status,
    "approved",
  );
  assert.equal(
    (
      await q("select status from public.leave_requests where id=$1", [future])
    )[0].status,
    "pending",
  );
  const count = (
    await q(
      "select * from public.notifications where title='😊 Leave automatically approved'",
    )
  ).length;
  await db.exec("select public.process_elapsed_leave()");
  assert.equal(
    (
      await q(
        "select * from public.notifications where title='😊 Leave automatically approved'",
      )
    ).length,
    count,
  );
});
test("history clearing is private and preserves source records", async () => {
  await as(ids.a);
  await db.query("select public.clear_history($1)", [[sheetId]]);
  assert.equal(
    (
      await q("select * from public.history_hidden where timesheet_id=$1", [
        sheetId,
      ])
    ).length,
    1,
  );
  assert.equal(
    (await q("select * from public.timesheets where id=$1", [sheetId])).length,
    1,
  );
  await as(ids.manager);
  assert.equal((await q("select * from public.history_hidden")).length, 0);
});
test("project client details and employee location persist with role checks", async () => {
  await as(ids.a);
  await assert.rejects(
    db.query(
      "select public.save_project_details('Client test','','active','Acme','India','Hyderabad')",
    ),
    /access required/,
  );
  await as(ids.manager);
  const id = (
    await q(
      "select public.save_project_details('Client test','','active','Acme','India','Hyderabad') id",
    )
  )[0].id;
  assert.equal(
    (await q("select client_name from public.projects where id=$1", [id]))[0]
      .client_name,
    "Acme",
  );
  await as(ids.admin);
  const employee = (
    await q(
      "select public.provision_employee_at_location('location@example.test','New employee','Engineer',$1,'Hyderabad, IN') id",
      [d1],
    )
  )[0].id;
  assert.equal(
    (
      await q("select location from public.employees where id=$1", [employee])
    )[0].location,
    "Hyderabad, IN",
  );
});

test("successive undo restores an edited entry and then removes its creation", async () => {
  await db.exec("reset role");
  const date = (await q("select (private.calendar_today()+190)::text d"))[0].d;
  await as(ids.a);
  const id = (
    await q("select public.save_calendar_entry($1,$2,$3,'Undo chain',60) id", [
      ids.a,
      date,
      project,
    ])
  )[0].id;
  await db.query(
    "select public.save_calendar_entry($1,$2,$3,'Undo chain edited',120,'Completed',$4,1)",
    [ids.a, date, project, id],
  );
  await db.exec("select public.undo_calendar_change()");
  assert.equal(
    (
      await q("select description from public.time_entries where id=$1", [id])
    )[0].description,
    "Undo chain",
  );
  await db.exec("select public.undo_calendar_change()");
  assert.equal(
    (await q("select * from public.time_entries where id=$1", [id])).length,
    0,
  );
});

test("historical dates require an explicit grant even for administrators", async () => {
  await db.exec("reset role");
  const old = (await q("select (private.calendar_today()-180)::text d"))[0].d;
  await as(ids.admin);
  await assert.rejects(
    q(
      "select public.save_calendar_entry($1,$2,$3,'Restricted administrator',60,'In Progress')",
      [ids.admin, old, project],
    ),
    /Restricted date/,
  );
  await as(ids.manager);
  await q("select public.grant_calendar_access($1,$2,$2,$3)", [
    [ids.admin],
    old,
    "Explicit historical correction",
  ]);
  await as(ids.admin);
  await q(
    "select public.save_calendar_entry($1,$2,$3,'Authorized administrator',60,'In Progress')",
    [ids.admin, old, project],
  );
});

test("map pins are private by default, optionally shared, and invalidated by address changes", async () => {
  await db.exec("reset role");
  await q(
    "insert into public.employee_private_details(user_id,address) values($1,'Test address A') on conflict(user_id) do update set address=excluded.address",
    [ids.a],
  );
  await as(ids.a);
  await q("select public.save_my_map_pin(17.4,78.5,'Test address A',false)");
  assert.equal(
    (await q("select * from public.employee_map_locations")).length,
    1,
  );
  await assert.rejects(
    q("select public.save_my_map_pin(17.4,78.5,'Stale address',true)"),
    /Save your current address/,
  );
  await as(ids.b);
  assert.equal(
    (await q("select * from public.employee_map_locations")).length,
    0,
  );
  await assert.rejects(
    q("update public.employee_map_locations set shared=true"),
    /permission denied/,
  );
  await as(ids.admin);
  assert.equal(
    (
      await q("select * from public.employee_map_locations where user_id=$1", [
        ids.a,
      ])
    ).length,
    1,
  );
  await as(ids.a);
  await q("select public.save_my_map_sharing(17.4,78.5,'Test address A',true,$1,$2)",[[],[ids.b]]);
  await as(ids.b);
  assert.equal(
    (await q("select * from public.employee_map_locations")).length,
    1,
  );
  await as(ids.outsider);
  assert.equal(
    (await q("select * from public.employee_map_locations")).length,
    0,
  );
  await assert.rejects(
    q("select public.save_my_map_pin(17,78,'Test address A',true)"),
  );
  await db.exec("reset role");
  await q(
    "update public.employee_private_details set address='Test address B' where user_id=$1",
    [ids.a],
  );
  assert.equal(
    (await q("select * from public.employee_map_locations")).length,
    0,
  );
});

test('map sharing scopes employees by location or person and restricts leads to their department',async()=>{
 await db.exec('reset role');await q("update public.employee_private_details set address='Shared test address' where user_id=$1",[ids.a]);await q("update public.employees set location='Mumbai, IN' where user_id=$1",[ids.b]);
 await as(ids.a);await q("select public.save_my_map_sharing(18,78,'Shared test address',false,$1,$2)",[[],[]]);
 await as(ids.manager);assert.equal((await q('select * from public.employee_map_locations where user_id=$1',[ids.a])).length,1);
 await as(ids.b);assert.equal((await q('select * from public.employee_map_locations where user_id=$1',[ids.a])).length,0);
 await as(ids.a);await q("select public.save_my_map_sharing(18,78,'Shared test address',true,$1,$2)",[['Mumbai, IN'],[]]);
 await as(ids.b);assert.equal((await q('select * from public.employee_map_locations where user_id=$1',[ids.a])).length,1);
 await db.exec('reset role');await q("update public.memberships set department_id=$1 where user_id=$2",[d2,ids.manager]);
 await as(ids.a);await q("select public.save_my_map_sharing(18,78,'Shared test address',true,$1,$2)",[[],[ids.manager]]);
 await as(ids.manager);assert.equal((await q('select * from public.employee_map_locations where user_id=$1',[ids.a])).length,0);
 await as(ids.admin);assert.equal((await q('select * from public.employee_map_locations where user_id=$1',[ids.a])).length,1);
 await db.exec('reset role');await q('update public.memberships set department_id=$1 where user_id=$2',[d1,ids.manager]);
});
test('birthday calendar reveals the celebration date but not private birth year',async()=>{
 await db.exec('reset role');await q("update public.employee_private_details set dob='1992-02-29' where user_id=$1",[ids.a]);await as(ids.b);
 const row=(await q('select * from public.calendar_birthdays(2027) where user_id=$1',[ids.a]))[0];assert.ok(row);assert.equal(new Date(row.birthday).toISOString().slice(0,10),'2027-02-28');assert.deepEqual(Object.keys(row).sort(),['birthday','full_name','user_id']);
 assert.equal((await q('select * from public.employee_private_details where user_id=$1',[ids.a])).length,0);
 await as(ids.outsider);await assert.rejects(q('select * from public.calendar_birthdays(2027)'));
});
test('history activity is durable, scoped, and cleared only for the requesting viewer',async()=>{
 await as(ids.a);const own=await q('select * from public.workspace_activity where user_id=$1',[ids.a]);assert.ok(own.some(a=>a.action==='Moved entry to another date'));assert.ok(own.some(a=>a.action==='Applied for leave'));
 const id=own[0].id;await q('select public.clear_workspace_history($1,$2)',[[],[id]]);assert.ok((await q('select * from public.activity_hidden where activity_id=$1',[id])).length);assert.ok((await q('select * from public.workspace_activity where id=$1',[id])).length);
 await as(ids.b);assert.equal((await q('select * from public.workspace_activity where user_id=$1',[ids.a])).length,0);assert.equal((await q('select * from public.activity_hidden where activity_id=$1',[id])).length,0);
});
test('administrator and location editors enforce profile boundaries', async () => {
 await db.exec('reset role');
 await q("update public.employees set location=case when user_id=$1 then 'SYMBIOSYS' else 'INDIA' end where user_id in ($1,$2)",[ids.a,ids.b]);
 const a=(await q('select * from public.employees where user_id=$1',[ids.a]))[0];
 const b=(await q('select * from public.employees where user_id=$1',[ids.b]))[0];
 const editor=(await q('select id from public.employees where user_id=$1',[ids.manager]))[0];
 await q("insert into public.profile_editor_scopes values($1,'SYMBIOSYS')",[editor.id]);
 const edit=(e,location=e.location,department=e.department_id)=>q('select public.admin_update_employee($1,$2,$3,$4,$5,$6,$7,$8,$9)',[e.id,e.full_name,e.employee_code,'Updated title',department,location,'','12345','Test address']);
 await as(ids.b);await assert.rejects(edit(a));
 await as(ids.manager);await edit(a);await assert.rejects(edit(b));await assert.rejects(edit(a,'INDIA'));await assert.rejects(edit(a,a.location,d2));
 assert.equal((await q('select phone from public.employee_private_details where user_id=$1',[ids.a]))[0].phone,'12345');
 assert.equal((await q('select phone from public.employee_private_details where user_id=$1',[ids.b])).length,0);
 await q("insert into storage.objects(bucket_id,name) values('avatars',$1)",[ids.a+'/scoped.png']);
 await q('select public.admin_set_employee_avatar($1,$2)',[a.id,ids.a+'/scoped.png']);
 await assert.rejects(q("insert into storage.objects(bucket_id,name) values('avatars',$1)",[ids.b+'/denied.png']));
 await assert.rejects(q('select public.archive_employee($1,$2)',[a.id,'Left']));
 await q("select public.save_extended_profile($1,'{}','[]','[]','[]',$2,'{}')",[a.id,['React']]);
 await assert.rejects(q("select public.save_extended_profile($1,'{}','[]','[]','[]',$2,'{}')",[b.id,['React']]));
 await db.exec('reset role');await q('update public.memberships set active=false where user_id=$1',[ids.manager]);
 await as(ids.manager);await assert.rejects(edit(a));
 await db.exec('reset role');await q('update public.memberships set active=true where user_id=$1',[ids.manager]);
 await as(ids.admin);await edit(b);await edit(a,'INDIA',d2);
 assert.equal((await q('select department_id from public.memberships where user_id=$1',[ids.a]))[0].department_id,d2);
});
test('employee removal revokes access and preserves historical records',async()=>{
 await as(ids.admin);const a=(await q('select id from public.employees where user_id=$1',[ids.a]))[0];
 const admin=(await q('select id from public.employees where user_id=$1',[ids.admin]))[0];
 const before=(await q('select count(*)::int as n from public.time_entries'))[0].n;
 await assert.rejects(q("select public.archive_employee($1,'Left')",[admin.id]));
 await q("select public.archive_employee($1,'Terminated')",[a.id]);
 await db.exec('reset role');
 assert.equal((await q('select count(*)::int as n from public.time_entries'))[0].n,before);
 await as(ids.admin);
 assert.equal((await q('select departure_status from public.employees where id=$1',[a.id]))[0].departure_status,'Terminated');
 assert.equal((await q('select active from public.memberships where user_id=$1',[ids.a]))[0].active,false);
 await as(ids.a);await assert.rejects(q('select public.claim_profile()'));
 assert.equal((await q('select * from public.employees')).length,0);
});
test('administrators edit private details and map pins before account activation',async()=>{
 await db.exec('reset role');
 const pending=(await q("insert into public.employees(email,full_name,location) values('pending@example.test','Pending employee','SYMBIOSYS') returning *"))[0];
 await as(ids.admin);
 await q('select public.admin_update_employee($1,$2,null,$3,null,$4,$5,$6,$7)',[pending.id,'Pending employee','Designer','SYMBIOSYS','','123456','Saved address']);
 await q("select public.save_extended_profile($1,'{}','[]','[]','[]','{}',$2)",[pending.id,{gender:'Female',marital_status:'Single',blood_group:'A+',home_number:'987654'}]);
 assert.equal((await q('select phone from public.employee_private_details where employee_id=$1',[pending.id]))[0].phone,'123456');
 await q("select public.save_employee_map($1,17,83,'Saved address',false,'{}','{}')",[pending.id]);
 assert.equal((await q('select latitude from public.employee_map_locations where employee_id=$1',[pending.id]))[0].latitude,17);
 await as(ids.b);assert.equal((await q('select * from public.employee_private_details where employee_id=$1',[pending.id])).length,0);
 await assert.rejects(q("select public.save_employee_map($1,17,83,'Saved address',false,'{}','{}')",[pending.id]));
 await db.exec('reset role');const uid='00000000-0000-4000-a000-000000000099';await q("insert into auth.users values($1,'pending@example.test',now())",[uid]);await q("insert into private.allowed_emails(email) values('pending@example.test')");
 await as(uid);await q('select public.claim_profile()');
 const details=(await q('select * from public.employee_private_details where user_id=$1',[uid]))[0];assert.equal(details.employee_id,pending.id);assert.equal(details.phone,'123456');assert.equal(details.gender,'Female');
 assert.equal((await q('select latitude from public.employee_map_locations where user_id=$1',[uid]))[0].latitude,17);
 await q("select public.update_my_profile('Pending employee',null,'SYMBIOSYS','','999','New address')");
 assert.equal((await q('select * from public.employee_map_locations where user_id=$1',[uid])).length,0);
});
test('notes, folders and attachments remain owner-private and reject cross-owner links',async()=>{
 await as(ids.b);const folder=(await q("insert into public.workspace_folders(name) values('Plans') returning id"))[0].id;
 const note=(await q("insert into public.workspace_notes(folder_id,title,content) values($1,'Private plan','<h1>Goals</h1>') returning id",[folder]))[0].id;
 await q("insert into storage.objects(bucket_id,name) values('workspace-files',$1)",[ids.b+'/plan.pdf']);
 const file=(await q("select public.register_workspace_file('plan.pdf',$1,'application/pdf',100,$2,$3) as id",[ids.b+'/plan.pdf',folder,note]))[0].id;
 await as(ids.admin);assert.equal((await q('select * from public.workspace_notes where id=$1',[note])).length,0);assert.equal((await q('select * from public.workspace_files where id=$1',[file])).length,0);
 await assert.rejects(q("insert into public.workspace_notes(folder_id,title) values($1,'Intrusion')",[folder]));
 await assert.rejects(q("select public.register_workspace_file('stolen.pdf',$1,'application/pdf',100,null,null)",[ids.b+'/plan.pdf']));
 await q("insert into storage.objects(bucket_id,name) values('workspace-files',$1)",[ids.admin+'/own.pdf']);
 await assert.rejects(q("select public.register_workspace_file('own.pdf',$1,'application/pdf',100,null,$2)",[ids.admin+'/own.pdf',note]));
 await assert.rejects(q("insert into storage.objects(bucket_id,name) values('workspace-files',$1)",[ids.b+'/intrusion.pdf']));
 await as(ids.b);await q('delete from public.workspace_notes where id=$1',[note]);assert.equal((await q('select note_id from public.workspace_files where id=$1',[file]))[0].note_id,null);
 await q('delete from public.workspace_folders where id=$1',[folder]);assert.equal((await q('select folder_id from public.workspace_files where id=$1',[file]))[0].folder_id,null);
 await db.exec('reset role');await q('update public.memberships set active=false where user_id=$1',[ids.b]);await as(ids.b);assert.equal((await q('select * from public.workspace_files')).length,0);
});
test('note sharing notifies only new recipients, permits likes, and revokes attachment access',async()=>{
 await db.exec('reset role');await q('update public.memberships set active=true where user_id=$1',[ids.b]);
 await as(ids.admin);const note=(await q("insert into public.workspace_notes(title,content) values('Team plan','<p>Shared ideas</p>') returning id"))[0].id;
 const path=ids.admin+'/shared-plan.pdf';await q("insert into storage.objects(bucket_id,name) values('workspace-files',$1)",[path]);
 await q("select public.register_workspace_file('shared.pdf',$1,'application/pdf',123,null,$2)",[path,note]);
 await q('select public.share_workspace_note($1,$2)',[note,[ids.b]]);await q('select public.share_workspace_note($1,$2)',[note,[ids.b]]);
 await as(ids.b);assert.equal((await q('select * from public.workspace_notes where id=$1',[note])).length,1);
 assert.equal((await q('select * from public.notifications where note_id=$1',[note])).length,1);
 assert.equal((await q("select * from storage.objects where bucket_id='workspace-files' and name=$1",[path])).length,1);
 assert.equal((await q('select * from public.workspace_files where note_id=$1',[note])).length,1);
 assert.equal((await q("update public.workspace_notes set title='Not allowed' where id=$1 returning id",[note])).length,0);
 await assert.rejects(q('select public.share_workspace_note($1,$2)',[note,[ids.manager]]));
 await q('insert into public.workspace_note_likes(note_id) values($1)',[note]);await assert.rejects(q('insert into public.workspace_note_likes(note_id) values($1)',[note]));
 await as(ids.manager);assert.equal((await q('select * from public.workspace_notes where id=$1',[note])).length,0);await assert.rejects(q('insert into public.workspace_note_likes(note_id) values($1)',[note]));
 await as(ids.admin);assert.equal((await q('select * from public.workspace_note_likes where note_id=$1',[note])).length,1);await q("select public.share_workspace_note($1,'{}')",[note]);
 await as(ids.b);assert.equal((await q('select * from public.workspace_notes where id=$1',[note])).length,0);assert.equal((await q("select * from storage.objects where bucket_id='workspace-files' and name=$1",[path])).length,0);assert.equal((await q('select * from public.workspace_files where note_id=$1',[note])).length,0);await assert.rejects(q('insert into public.workspace_note_likes(note_id) values($1)',[note]));
});
test('employee backups require administrators and retain inactive employee history without exporting other users',async()=>{
 await as(ids.admin);const employee=(await q('select id from public.employees where user_id=$1',[ids.a]))[0];
 const backup=(await q('select public.export_employee_backup($1) as result',[employee.id]))[0].result;
 assert.equal(backup.employee.id,employee.id);assert.ok(backup.timesheets.length);assert.ok(backup.entries.length);assert.ok(backup.activity.length);assert.ok(backup.calendar_change_history.length);
 assert.ok(backup.timesheets.every(s=>s.user_id===ids.a));assert.ok(backup.entries.every(e=>backup.timesheets.some(s=>s.id===e.timesheet_id)));assert.ok(backup.activity.every(a=>a.user_id===ids.a));
 assert.equal(backup.workspace_notes,undefined);assert.equal(backup.membership[0].active,false);
 await as(ids.manager);await assert.rejects(q('select public.export_employee_backup($1)',[employee.id]),/Administrator/);
 await as(ids.b);await assert.rejects(q('select public.export_employee_backup($1)',[employee.id]),/Administrator/);
});
