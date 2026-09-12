# TAE Placement - Product Rules

Permanent product principles for the Toronto Academy of Education internal placement
management application. These rules apply to every ticket. If a proposed feature
conflicts with a rule here, the rule wins until the rule itself is changed.

## Permanent principles

1. **Internal tool, not SaaS.** This is an operations tool for a very small staff
   team. No billing, no workspaces, no tenants, no marketing surfaces.
2. **Ease of use before feature count.** A staff member should understand what to
   click without training. Fewer, clearer features beat more features.
3. **Large readable interface.** Large type, generous spacing, large clickable
   areas. No dense CRM layouts and no tiny operational text.
4. **Minimal clicks.** Common operations should take very few steps. Do not bury
   routine work behind nested menus.
5. **Visual status before dense text.** Show state with clear, simple visual
   indicators rather than long text or wide tables.
6. **Student and Placement Partner are primary records.** Everything else hangs
   off these two.
7. **Placement connects the student and partner.** A placement is the link
   between a student record and a placement partner record.
8. **Configuration belongs in Admin.** Options that staff may need to change live
   in Admin, not scattered through the interface.
9. **Do not hard-code business categories that should be configurable.** Placement
   areas, statuses, and similar lists belong in configuration.
10. **Avoid duplicate work for staff.** Never ask for the same information twice.
    Reuse what the system already knows.
11. **Never expose private student information publicly.** No student data in
    public routes, public assets, logs, or screenshots.
12. **Private local source files must not be committed.** Spreadsheets, exports,
    credentials, and environment files stay out of the repository.
13. **Build one operational workflow at a time.** Finish a workflow properly
    before starting the next one.
14. **Do not add features without an identified operational purpose.** Every
    feature must answer a real staff need.

## Intended high-level workflow

```
Student
  -> Placement Readiness
    -> Partner Matching
      -> Placement Assignment
        -> Active Placement
          -> Check-ins
            -> Completion
```

Each stage is built in its own ticket. Later stages must not be partially
implemented inside earlier tickets.

## Interface rules

Use:

- light interface, white or near-white surfaces on a soft neutral page background
- dark, highly readable text
- one restrained blue accent
- soft borders, rounded corners, subtle shadows only where useful
- plain language in the UI, with minimal technical wording

Avoid:

- gradients and glassmorphism
- dark mode
- tiny fonts
- excessive animation
- dense tables and charts
- icon-only desktop navigation

## Data rules

- No fake student names, numbers, or statistics in the interface.
- Placeholder values stay neutral until real data exists.
- No real health data, document details, LTC contacts, or addresses in the
  repository.
