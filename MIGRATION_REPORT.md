# Migration preparation report

Prepared from the authoritative original employee dataset. This report contains counts, not employee personal information.

| Item | Result |
| --- | --- |
| Primary employee records | 119 prepared |
| Blank employee codes | Preserved as NULL; employee can enter a unique code in their profile |
| Login identifier | Verified email address; never employee code |
| Nested public employee dataset | 268 records excluded from the new import |
| Legacy calendar records | 478 inspected |
| No employee match | 419 excluded |
| Missing record ID | 12 excluded |
| Combined invalid records | 431 excluded |
| Remaining valid legacy entries | 47 archived privately |
| Calendar work entries to import | 0; new workspace starts clean |
| Public employee JSON/documents in replacement | 0 |
| Original source backup | Preserved privately |
| Remote database changes | None performed |

The cleanup applies to the **prepared replacement/import**, not the original checkout or a live database. The original project could not be edited with the granted filesystem permissions. Private backup and migration folders are ignored by Git and excluded from the source ZIP. Do not commit them or serve the project root as a static directory.

Employee UUIDs replace unreliable employee-code references. Email provisioning controls who may claim an employee profile. Private contact details remain separate from directory fields and are attached to the verified owner after account activation. Old Auth sessions, OTP logic, employee documents and passwords are not imported.
