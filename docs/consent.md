# Consentimiento y aviso de privacidad — heribertova.do

Status: **borrador para aprobación del dueño** (v1, 2026-09-28)
Ley aplicable: Ley 172-13 sobre Protección de Datos de Carácter Personal (República Dominicana).
Recomendación: pedir a un abogado que lo lea una vez antes del lanzamiento (es opcional, pero el texto trata datos sensibles: simpatía política).

Where each text is used:
1. **Checkbox** on the "Nuevo miembro" form (required to save).
2. **Short notice** shown right above the checkbox.
3. **Full notice** at `/privacidad` (linked from the form and the login page). Leaders can read it aloud or show it on their phone to the person.

When a member is saved, the app records: who ticked the box, the date and time, and the version of the text (`consentVersion: "v1"`).

---

## 1. Checkbox (texto exacto)

> ☐ **La persona me autorizó a registrarla** en la plataforma de la campaña de Heriberto Santana y a guardar sus datos de contacto y fotos, según el [aviso de privacidad](/privacidad).

## 2. Aviso corto (encima del checkbox)

> Antes de guardar, explique a la persona: sus datos se usarán solo para organizar la campaña de Heriberto Santana en Higüey; no se venden ni se comparten; puede pedir que la borren cuando quiera.

## 3. Aviso de privacidad completo (`/privacidad`)

> **Aviso de privacidad — Campaña Heriberto Santana, Higüey**
>
> **¿Quién guarda sus datos?** El equipo de la campaña de Heriberto Santana a la Alcaldía de Higüey, a través de la plataforma heribertova.do.
>
> **¿Qué datos guardamos?** Su nombre, cédula, fecha de nacimiento, sector, recinto y colegio electoral (tomados del padrón de electores), y los datos que usted nos da: teléfono, WhatsApp, correo, apodo, foto de su cédula y una foto suya.
>
> **¿Para qué?** Solo para organizar la campaña: saber quiénes nos apoyan, formar equipos por recinto y poder contactarle para actividades de la campaña. No usamos sus datos para nada más.
>
> **¿Quién los ve?** Solo el líder de su equipo y los coordinadores de la campaña que trabajan en su recinto. Nadie más.
>
> **¿Se comparten o se venden?** No. Nunca vendemos ni compartimos sus datos con otras personas, partidos o empresas.
>
> **¿Cómo los protegemos?** La plataforma tiene acceso con contraseña, las fotos se guardan de forma privada y registramos quién consulta la información.
>
> **¿Por cuánto tiempo?** Hasta que termine la campaña. Después se borran, salvo que usted nos autorice a mantenerlos.
>
> **Sus derechos.** Puede pedir en cualquier momento ver sus datos, corregirlos o que los borremos. Solo tiene que decírselo a su líder de equipo o escribir a **[correo o WhatsApp de contacto de la campaña]**, y lo haremos.
>
> **Participar es voluntario.** Usted no está obligado a registrarse, y registrarse no le obliga a nada.
>
> Última actualización: [fecha de publicación].

---

## Decisions for the owner
- [ ] Approve the three texts (or mark changes).
- [ ] Contact channel for data requests (email or WhatsApp number) to fill in `[correo o WhatsApp de contacto de la campaña]`.
- [ ] Confirm "borrar al terminar la campaña" as the retention rule (the plan's 9.4 deletion script supports it).
