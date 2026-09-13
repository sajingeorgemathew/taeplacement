"use client";

import { Archive, Mail, Phone, Plus, RotateCcw, Star } from "lucide-react";
import { useState, useTransition } from "react";

import {
  createContactAction,
  setContactActiveAction,
  setPrimaryContactAction,
  updateContactAction,
} from "@/lib/partners/actions";
import type { PartnerContact } from "@/lib/partners/queries";

import ContactForm from "./ContactForm";

type ContactsSectionProps = {
  partnerId: string;
  contacts: PartnerContact[];
  canManage: boolean;
};

const ACTION_BUTTON =
  "inline-flex items-center gap-2 rounded-2xl border border-line bg-surface px-5 py-3.5 text-[16px] font-medium text-ink transition-colors hover:border-brand hover:bg-brand-soft hover:text-brand-strong disabled:opacity-60";

/**
 * Every contact at one partner.
 *
 * A partner legitimately has many contacts, including two with the same name, so
 * nothing is merged here. Contacts are archived, never deleted: an imported
 * Zoho record is a source record.
 */
export default function ContactsSection({
  partnerId,
  contacts,
  canManage,
}: ContactsSectionProps) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const active = contacts.filter((contact) => contact.is_active);
  const archived = contacts.filter((contact) => !contact.is_active);

  function run(work: () => Promise<{ error: string | null }>) {
    setError(null);
    startTransition(async () => {
      const result = await work();
      setError(result.error);
    });
  }

  function renderContact(contact: PartnerContact) {
    const isEditing = editingId === contact.id;

    return (
      <li
        key={contact.id}
        className={`rounded-2xl border p-6 ${
          contact.is_active
            ? "border-line bg-surface-muted"
            : "border-line bg-surface-muted opacity-80"
        }`}
      >
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h3 className="text-[20px] font-semibold leading-tight text-ink">
                {contact.full_name}
              </h3>
              {contact.is_primary ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-ready-line bg-ready-soft px-4 py-1.5 text-[15px] font-medium text-ready-ink">
                  <Star size={16} aria-hidden="true" />
                  Primary
                </span>
              ) : null}
              {!contact.is_active ? (
                <span className="rounded-full border border-line bg-surface px-4 py-1.5 text-[15px] font-medium text-ink-muted">
                  Archived
                </span>
              ) : null}
            </div>

            {contact.job_title ? (
              <p className="mt-2 text-[16px] text-ink-muted">
                {contact.job_title}
              </p>
            ) : null}

            <div className="mt-3 flex flex-col gap-2">
              {contact.email ? (
                <p className="flex items-start gap-2 text-[16px] text-ink">
                  <Mail
                    size={18}
                    aria-hidden="true"
                    className="mt-1 shrink-0 text-ink-muted"
                  />
                  <a
                    href={`mailto:${contact.email}`}
                    className="min-w-0 break-words hover:text-brand-strong"
                  >
                    {contact.email}
                  </a>
                </p>
              ) : null}
              {contact.phone ? (
                <p className="flex items-start gap-2 text-[16px] text-ink">
                  <Phone
                    size={18}
                    aria-hidden="true"
                    className="mt-1 shrink-0 text-ink-muted"
                  />
                  <span className="min-w-0 break-words">{contact.phone}</span>
                </p>
              ) : null}
              {!contact.email && !contact.phone ? (
                <p className="text-[16px] text-ink-muted">
                  No email or phone on file.
                </p>
              ) : null}
            </div>
          </div>

          {canManage ? (
            <div className="flex flex-wrap gap-3 lg:shrink-0">
              <button
                type="button"
                onClick={() => setEditingId(isEditing ? null : contact.id)}
                aria-expanded={isEditing}
                className={ACTION_BUTTON}
              >
                {isEditing ? "Close" : "Edit"}
              </button>

              {contact.is_active && !contact.is_primary ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    run(() =>
                      setPrimaryContactAction({
                        contactId: contact.id,
                        partnerId,
                        isPrimary: true,
                      }),
                    )
                  }
                  className={ACTION_BUTTON}
                >
                  <Star size={18} aria-hidden="true" />
                  Mark Primary
                </button>
              ) : null}

              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  run(() =>
                    setContactActiveAction({
                      contactId: contact.id,
                      partnerId,
                      isActive: !contact.is_active,
                    }),
                  )
                }
                className={ACTION_BUTTON}
              >
                {contact.is_active ? (
                  <>
                    <Archive size={18} aria-hidden="true" />
                    Archive
                  </>
                ) : (
                  <>
                    <RotateCcw size={18} aria-hidden="true" />
                    Restore
                  </>
                )}
              </button>
            </div>
          ) : null}
        </div>

        {isEditing && canManage ? (
          <div className="mt-6 border-t border-line pt-6">
            <ContactForm
              idPrefix={`contact-${contact.id}`}
              action={updateContactAction}
              partnerId={partnerId}
              contact={contact}
              submitLabel="Save Contact"
              onDone={() => setEditingId(null)}
            />
          </div>
        ) : null}
      </li>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {error ? (
        <p
          role="alert"
          className="rounded-2xl border border-attention-line bg-attention-soft px-6 py-4 text-[16px] text-attention-ink"
        >
          {error}
        </p>
      ) : null}

      {canManage ? (
        <div>
          <button
            type="button"
            onClick={() => setAdding((open) => !open)}
            aria-expanded={adding}
            className="inline-flex items-center gap-2 rounded-2xl bg-brand px-6 py-4 text-[17px] font-semibold text-white transition-colors hover:bg-brand-strong"
          >
            <Plus size={22} aria-hidden="true" />
            {adding ? "Hide form" : "Add Contact"}
          </button>

          {adding ? (
            <div className="mt-6 rounded-2xl border border-line bg-surface-muted p-6">
              <ContactForm
                idPrefix="new-contact"
                action={createContactAction}
                partnerId={partnerId}
                submitLabel="Add Contact"
                onDone={() => setAdding(false)}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {active.length === 0 ? (
        <p className="text-[17px] text-ink-muted">
          No contacts yet.
          {canManage ? " Use Add Contact to record the first one." : ""}
        </p>
      ) : (
        <ul className="flex flex-col gap-4">{active.map(renderContact)}</ul>
      )}

      {archived.length > 0 ? (
        <details className="rounded-2xl border border-line bg-surface p-6">
          <summary className="cursor-pointer text-[17px] font-medium text-ink">
            Archived contacts ({archived.length})
          </summary>
          <p className="mt-3 text-[16px] text-ink-muted">
            Archived contacts are kept. A contact imported from Zoho is never
            deleted.
          </p>
          <ul className="mt-5 flex flex-col gap-4">
            {archived.map(renderContact)}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
