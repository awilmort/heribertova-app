# LOE (loe.pld.do) — Functional Analysis

Status: reference (input to `HERIBERTO_ARCHITECTURE.md`)
Created: 2026-09-28
Method: static analysis of the production Angular bundles served by `https://loe.pld.do` (routes, guards, services, UI strings, business constants) plus a minimal, read-only authenticated session against `https://api.pldloe.org` using the credentials supplied by the project owner. Only the owner's own cédula was queried; no third-party records were read or stored. The session was logged out afterwards.

LOE = **Línea Organizativa y Electoral** of the PLD. It is the party's field-organization tool: it builds and verifies the party's grassroots structure, precinct by precinct (*recinto*), on top of the JCE voter roll (*padrón*).

---

## 1. Technical profile (what they built)

| Aspect | Finding |
|---|---|
| Frontend | Angular (v20, standalone components, signals), Tailwind + DaisyUI, ApexCharts, SheetJS (Excel export). Title `LOE_front_end_v20`. |
| Hosting | Frontend on Microsoft IIS 10; API `api.pldloe.org` behind Cloudflare. Backend is almost certainly ASP.NET (JWT carries `http://schemas.microsoft.com/ws/2008/06/identity/claims/role` claims) → most likely SQL Server underneath. |
| Auth | `POST /api/Auth/login {usuario: cédula, password}` → JWT in JSON body (stored in `localStorage`) + `refreshToken` httpOnly cookie. **Access token `expires_in` = 315,360,000 s (10 years)**; refresh cookie also expires in 2036. |
| Captcha | Generated and checked **only in the browser**; the API never sees it (no bot protection at the server). |
| Identity check | Browser posts cédula photo to an **n8n webhook** (`n8n-n8n.kxv0d4.easypanel.host/webhook/validar-cedula`) that returns `VALID_DOCUMENT`/`CONTINUE` (OCR). Selfie is uploaded as "prueba de vida" evidence. |
| Permissions | Hard-coded role→views map in the bundle **plus** a DB-driven override: `GET /api/PermisosLoe/cargo/{cargoId}` → `[{vistaKey, vistaNombre, ruta, puedeVer, soloLectura}]`. |
| SSO | "Ir a CONAP" handoff (`POST /api/Auth/conap-handoff`) to a sister system `conap.pld.do` (selección de recintos y conformación de mesas). |
| Territory | `GET /api/Common/getDemarcaciones` → 77 provincias (32 DR + exterior "provinces"), 89 circunscripciones, 221 municipios, 290 distritos municipales. Exterior users get relabeled levels (País/Ciudad, Estado, Condado). |

Lessons we will **not** copy: 10-year tokens, token in `localStorage`, client-only captcha, identity validation called from the browser straight to a third-party webhook, debug `console.log` of login form in production.

---

## 2. Roles (*cargos*)

19 cargos, each tied to a *demarcación* (territorial scope). One user may hold several cargo+demarcación pairs, choose one per session ("Cambiar Rol y Demarcación") and set a default (`setRolPredeterminado`).

| Id | Cargo | Default screen | Level |
|---|---|---|---|
| 1 | Presidente | provincial dashboard | national/provincial leadership |
| 2 | Enlace | provincial dashboard (read-only on validation) | liaison |
| 3 | Coordinador | general dashboard | coordinator |
| 4 | Enlace Provincial | provincial dashboard | provincia |
| 5 | Presidente Provincial | provincial dashboard | provincia |
| 6 | Comité Político (CP) | CI dashboard | provincia |
| 7 | **Presidente CI** (Comité Intermedio) | CI dashboard | group of recintos |
| 8 | Coordinador ETR (Equipo Territorial) | CI dashboard | territorial team |
| 9 | **APCB** — Aspirante a Presidente de Comité de Base | CI dashboard + Registro Miembros | aspiring team leader |
| 10 | **Presidente CB** (Comité de Base) | CI dashboard | team leader |
| 11–14, 16 | Secretarios / Vicesecretarios (Electoral, Organización, Tecnología) | provincial dashboard (read-only) | national staff |
| 15 | Comité Central | provincial dashboard | national |
| 17–19 | Enlace/Presidente de Seccional, Presidente de Condado | general dashboard | exterior (diaspora) |

**Mapping to this project:** *Supporter* ≈ Miembro CB; *Aspiring Team Leader* ≈ APCB; *Team Leader* ≈ Presidente CB; *Recinto Coordinator* ≈ Presidente CI; upper tiers ≈ provincial/national coordinators.

---

## 3. The core mechanic — how a supporter becomes a team leader

Confirmed from code constants and UI copy:

1. A **Presidente CI / coordinator** (or a Presidente CB from "Mi Recinto") nominates a person as **APCB**. The nomination form requires registering **at least 2 initial members** for the aspirant (`apcbMinMiembros = 2`, "Registre N miembro(s) más para habilitar la conversión"). The aspirant must have cédula photo + selfie. One APCB per nominating user at a time ("El usuario ya tiene un APCB registrado").
2. The **APCB** logs in and uses **Registro de Miembros** to register people under them.
3. When the APCB reaches **8 registered members** (`minimoRequeridoAPCB = 8`) they are **automatically promoted to Presidente CB**; the UI shows a confetti "¡Felicidades! Has alcanzado el mínimo requerido y ahora eres Presidente de CB", then refreshes the session/permissions without re-login.
4. A CB's goal is **20 members** ("Meta 20 CB's", `minimoRequeridos = 20`); the dashboard shows a radial progress (red < 30 %, amber < 70 %, green ≥ 70 %).
5. A Presidente CB can further nominate members from their CB as APCB ("Convertir a APCB"), growing the tree.

### Member registration rules
- Lookup by cédula (11 digits) → `GET /Consulta/consultaNuevoMiembro/{cedula}`; returns the name from the padrón or a rejection. **Rejection reasons include "Miembro del PLD" (already a party member) and "Esta persona ya está registrada en el sistema".** This is the affiliation filter this project must remove.
- Required: full name (prefilled from padrón), apodo (nickname), primary phone (+WhatsApp flag), optional secondary phone (+WhatsApp flag), email, **cédula photo** (JPG/PNG), **selfie with cédula**.
- Cédula photo is OCR-validated before save ("Validando documento…"); a coordinator can later "Validar miembro" (upload/replace documents, set status).
- If the person record saved but the photo upload failed: "no vuelva a registrar a la persona" — upload happens as a second step.
- Member status catalog (`getEstatusMiembro`): Confirmado, Excusa, No Contactado, Fallecido, Renuncia, Enfermo, Exterior, Inactivo, **Otro Partido**.
- Document completeness status: Pendiente → En proceso → Completado ("con cédula y selfie").

---

## 4. Screens (routes) and what they do

| Route | Screen | Roles | Functions |
|---|---|---|---|
| `/login` | Login | public | cédula + password, captcha, "Recuérdame", forgot password (temp key via **SMS or Email**), post-login system chooser (LOE vs CONAP) |
| `/registro-simpatia` | Public sympathy form | public | step 1: cédula + captcha → padrón lookup (manual names allowed if not found); step 2: names, WhatsApp/phone (one required), email, address, interest: *Miembro simpatizante* or *Militante*. Dedupes against members and previous expressions. |
| `/primer-login-presidente-ci` | First-login confirmation | Presidente CI | contact data, cédula photo + selfie ("prueba de vida"), accept "estatus de confirmado" |
| `/cuestionario` | Onboarding | most roles | update email/phone/password; download & acknowledge Reglamento + Guía (PDF); multiple-choice quiz with minimum score, retry |
| `/ci-dashboard` | Leader dashboard | 6–10 | KPIs: Ptes. CBs, Miembros ETR, Aspirantes (APCB), Miembros CB's, progress toward minimum (8) and goal (20) |
| `/dashboard` | General dashboard | 3, 17–19 | recinto status, validation of presidents, CI/ETR positioned, recintos without militants, new sympathizers, birthdays this month, Excel export |
| `/provincial-validacion` | Provincial dashboard | 1,2,4,5,11–16 | tabs Posicionamiento / Cedulación / Validación; ranking of provinces/municipios/circ; age & gender distribution; drill-down to recinto/person; Excel |
| `/provincial/circ`, `/municipios/…`, `/distritos/…`, `/recintos/…` | Territorial drill-down | 4–6 | hierarchical navigation |
| `/registro-miembros` | Member registration | APCB | list/search/paginate own members, create/edit/delete, OCR validation, promotion celebration |
| `/lista-miembros-cb` | My CB members | many | members with doc status, contact, sympathy-origin badge, validate, convert to APCB, Excel |
| `/ptes-cbs` | Team leaders & aspirants | Presidente CI | list Ptes. CB / APCB, their members, validate, edit, create APCB |
| `/mi-recinto` | My precinct | many | totals (electores, miembros, colegios, validados), list of **all electors of the recinto from the padrón** ("Solo electores" filter), elector detail (sexo, fecha nac., colegio, dirección recinto, cedulación), convert elector → member, create APCB, birthdays |
| `/recintos-sin-militantes` | Precinct management | 1,2,3,7,8 | recintos without members, assign/unassign Presidente CI to recintos, per-recinto follow-up (CB progress, structures without president), convert elector → member / APCB with OCR |
| `/expresion-simpatia` | Sympathy management | 1,2 | list captured sympathy forms, notifications to president, add/edit/delete, Excel & PDF export |
| `/cvp` | CVP / sub-commissions | 1,2 | *Comisión de Validación y Posicionamiento*: create sub-commissions, members with cargos (Enlace, Presidente, Sec. Organización/Electoral/Tecnología, Vocal), assign recintos |
| `/validacion-acta` | Recinto validation | many | per-recinto validation form: members, phones, OCR of cédula, selfie, date/time, up to 5 act images, draft/process, printable "Acta de validación y posicionamiento", discard/recover attachments (BackOffice approval), observations |
| `/ci` | CI / ETR positioning | 1–6, 11–16 | build *Comité Intermedio* (select 1–8 CBs, assign roles: Presidente, Vocal, Vocal adscrito), *Equipo Territorial* teams, upload acta/evidence/certificate, "desarmar", permission requests to BackOffice |
| `/reportes`, `/reporte-recintos` | Reports | leadership | recinto status by acta, totals (Ptes., validados, confirmados, CI positioned), Excel |
| `/notificaciones` | Incident center | per permission | observations raised by BackOffice per recinto/acta; read/respond; list & kanban; priority |
| `/user-info` | Profile | all | view data, change password (min 8) |

---

## 5. API surface (≈80 endpoints, 9 controllers)

- **Auth**: `login`, `refreshtoken`, `logout`, `resetPassword?cedula&metodo`, `conap-handoff`
- **Usuario**: `getUsuario`, `updateUsuario`, `changePassword`, `setRolPredeterminado`, `autoValidacion`, `createAPCB`, `updateAPCB`, `getCIUsuario`, `getEtrUsuario`
- **Consulta** (reads): `consultaPadron`, `getPersona`, `consultaNuevoMiembro/{c}`, `consultaAPCB/{c}`, `getAPCB`, `getNuevosMiembros`, `getNuevosMiembrosPorCedula`, `GetMiembrosPorPresidente`, `getMiembrosRecinto`, `getMiembrosPadronEnriquecido`, `getRecintos`, `getRecintosSinMiembros`, `getEstatusMiembro`, `getCargos*`, `getCumpleanosPorDemarcacion`, `getResumenPor{Provincia,Municipio,DistritoMunicipal}`, `getResumenValidacion*`, `getActa*`, `getCI`, `getEtrs`, `getSubcomisiones`, `getCuestionario`, `getFoto/{id}`, …
- **Registro** (writes): `createNuevoMiembro`, `updateNuevoMiembro`, `deleteNuevoMiembro`, `actualizarMiembro`, `confirmarMiembroRecinto`, `createCI`, `createEtr`, `createSubcomision`, `*MiembroCVP`, `posicionarActa`, `uploadAdjuntos`, `descartarAdjunto`, …
- **ExpresionSimpatia**: CRUD, `lookupCedula`, `external` (public form), `notificaciones`, `notificaciones/{id}/leer`, `notificaciones/resumen`
- **PresidentesCI**: `getPresidentesCI`, `asignarRecintos`, `quitarRecintos`
- **Dashboard**: `cedulacion[/detalle]`, `posicionamiento[/detalle]`
- **EstructuraTerritorial**: `getRankingProvincias`, `getMiembrosRecintosPaginado`, `getGestionRecintoSeguimiento`
- **Observaciones**, **Posicionamiento** (documents, versions, recover), **PermisosLoe**, **Common** (`getDemarcaciones`)

Response envelope everywhere: `{ success: bool, data: …, message: string }`; lists: `{ records, page, size, totalCount }`.

---

## 6. Data they hold per person (padrón + enrichment)

`consultaPadron` response fields: `cedula, nombreCompleto, esMiembroPartido, cargo, descripcionNivel, validado, estatusValidacion, posicionado, codigoRecinto, recinto, colegio, provincia, circ, municipio, dm, sectorRecinto, mesCumpleanos, cumpleanos, estatusHomologado, idEstatusCedula, estatusCedula, estaCedulado, datosExterior`.

`lookupCedula` returns `fuente: "Padron"` → there is a local padrón table on their side. The padrón is **enriched** with: party membership (the party's own affiliates roll), organizational cargo, validation/positioning status, and **cedulación** status (new-cédula renewal program; month of cedulation), used for the "Cedulación" dashboards.

Member record (`getNuevosMiembros`): `id, cedula, nombre, apodo, telefono, telefonoSecundario, whatsapp, whatsappSecundario, correo, fechaRegistro, registradoPor, cedulaResponsable, cargoId, cargoNombre`.

---

## 7. Differences required for this project

1. **No affiliation gate**: a person may be registered regardless of membership in PLD or any other party. Affiliation becomes (at most) an optional informational attribute, not an eligibility rule; "Otro Partido" stops being an exclusion status.
2. Everything else — padrón lookup, supporter → aspiring leader → team leader pipeline with thresholds, precinct views, sympathy form, dashboards, reports, onboarding quiz, incidents — is in scope for parity (see the plan for sequencing and which party-internal modules — CI/ETR/CVP/actas — are optional).
