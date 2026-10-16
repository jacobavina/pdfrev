import React, { useEffect, useState } from 'react';
import { Markup } from '../../types/markup';
import { useMarkupStore } from '../../store/useMarkupStore';
import { useDocumentStore } from '../../store/useDocumentStore';
import { useAttachmentStore, formatBytes } from '../../store/useAttachmentStore';
import { fieldTypeDef, fieldTypeOf, fieldOptions } from '../../core/markup/formFields';
import { isAllowedLinkUrl, normalizeLinkUrl, openExternalUrl, goToPageNumber, saveAttachment } from '../../services/linkService';

const inputCls =
  'w-full ui-input';

/** Campo de texto que confirma al salir o con Enter (un paso de deshacer por edición). */
const CommitInput: React.FC<{
  value: string;
  onCommit: (v: string) => void;
  testId: string;
  multiline?: boolean;
  placeholder?: string;
}> = ({ value, onCommit, testId, multiline, placeholder }) => {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => {
    if (draft !== value) onCommit(draft);
  };
  return multiline ? (
    <textarea
      data-testid={testId}
      className={`${inputCls} h-20 font-mono`}
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
    />
  ) : (
    <input
      data-testid={testId}
      className={inputCls}
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && commit()}
    />
  );
};

/**
 * Propiedades de enlaces, adjuntos y campos de formulario (ADR-0027): destino, archivo y nombre/valor/opciones,
 * como el panel de propiedades de Revu para estos objetos.
 */
export const InteractiveProperties: React.FC<{ markup: Markup }> = ({ markup }) => {
  const { applyPropertiesToMarkups, markups } = useMarkupStore();
  const numPages = useDocumentStore((s) => s.numPages);
  const set = (fields: Record<string, string | number | undefined>, desc: string) =>
    applyPropertiesToMarkups([markup.id], { customFields: fields }, desc);
  const label = (t: string) => <label className="text-gray-400 font-medium">{t}</label>;

  if (markup.type === 'link') {
    const uri = typeof markup.customFields?.linkUri === 'string' ? markup.customFields.linkUri : '';
    const page = typeof markup.customFields?.linkPage === 'number' ? markup.customFields.linkPage : undefined;
    return (
      <section data-testid="prop-link-section" className="flex flex-col gap-1.5 border-b border-cad-border pb-3">
        {label('Link action')}
        <span className="text-gray-300">{uri ? 'Open a web address' : `Go to page ${page ?? '—'}`}</span>
        {uri ? (
          <CommitInput
            testId="prop-link-url"
            value={uri}
            onCommit={(v) => {
              const u = normalizeLinkUrl(v);
              if (isAllowedLinkUrl(u)) set({ linkUri: u, linkPage: undefined }, 'Change link address');
            }}
          />
        ) : (
          <CommitInput
            testId="prop-link-page"
            value={String(page ?? 1)}
            onCommit={(v) => {
              const n = Number(v);
              if (Number.isInteger(n) && n >= 1 && n <= numPages) set({ linkPage: n, linkUri: undefined }, 'Change link page');
            }}
          />
        )}
        <button
          type="button"
          data-testid="prop-link-follow"
          onClick={() => (uri ? openExternalUrl(uri) : page !== undefined && goToPageNumber(page))}
          className="self-start px-2 py-1 rounded border border-cad-border hover:bg-cad-hover"
        >
          Follow link
        </button>
      </section>
    );
  }

  if (markup.type === 'fileAttachment') {
    const key = String(markup.customFields?.attachmentKey ?? '');
    const file = useAttachmentStore.getState().getAttachment(key);
    return (
      <section data-testid="prop-attachment-section" className="flex flex-col gap-1.5 border-b border-cad-border pb-3">
        {label('Attached file')}
        <span className="text-gray-200 break-all">{String(markup.customFields?.attachmentName ?? file?.name ?? '—')}</span>
        <span className="text-gray-500">{file ? formatBytes(file.bytes.length) : 'File not available in this document'}</span>
        <button
          type="button"
          data-testid="prop-attachment-save"
          disabled={!file}
          onClick={() => file && saveAttachment(file)}
          className="self-start px-2 py-1 rounded border border-cad-border hover:bg-cad-hover disabled:opacity-40"
        >
          Save attachment…
        </button>
      </section>
    );
  }

  if (markup.type === 'formField') {
    const ft = fieldTypeOf(markup);
    const name = String(markup.customFields?.fieldName ?? '');
    const value = String(markup.customFields?.fieldValue ?? '');
    const options = fieldOptions(markup);
    const nameTaken = (n: string) =>
      markups.some(
        (m) =>
          m.id !== markup.id &&
          m.type === 'formField' &&
          m.customFields?.fieldName === n &&
          !(ft === 'radio' && fieldTypeOf(m) === 'radio')
      );
    return (
      <section data-testid="prop-field-section" className="flex flex-col gap-1.5 border-b border-cad-border pb-3">
        {label(`${fieldTypeDef(ft).label} field`)}
        {label(ft === 'radio' ? 'Group name' : 'Name')}
        <CommitInput
          testId="prop-field-name"
          value={name}
          onCommit={(v) => {
            const n = v.trim();
            if (n && !nameTaken(n)) set({ fieldName: n }, 'Rename field');
          }}
        />
        {ft === 'radio' && (
          <>
            {label('Export value')}
            <CommitInput testId="prop-field-radio-value" value={String(markup.customFields?.radioValue ?? '')} onCommit={(v) => v.trim() && set({ radioValue: v.trim() }, 'Change export value')} />
          </>
        )}
        {ft === 'text' && (
          <>
            {label('Value')}
            <CommitInput testId="prop-field-value" value={value} onCommit={(v) => set({ fieldValue: v }, 'Fill text field')} />
          </>
        )}
        {(ft === 'checkbox' || ft === 'radio') && (
          <label className="flex items-center gap-1.5 text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              data-testid="prop-field-checked"
              checked={value === 'Yes'}
              onChange={(e) => {
                if (ft === 'radio' && e.target.checked) {
                  const others = markups
                    .filter((m) => m.type === 'formField' && m.id !== markup.id && fieldTypeOf(m) === 'radio' && m.customFields?.fieldName === name)
                    .map((m) => m.id);
                  if (others.length) applyPropertiesToMarkups(others, { customFields: { fieldValue: 'Off' } }, `Clear ${name}`);
                }
                set({ fieldValue: e.target.checked ? 'Yes' : 'Off' }, e.target.checked ? 'Check field' : 'Uncheck field');
              }}
              className="accent-cad-accent"
            />
            Checked
          </label>
        )}
        {(ft === 'listbox' || ft === 'dropdown') && (
          <>
            {label('Options (one per line)')}
            <CommitInput
              testId="prop-field-options"
              multiline
              value={options.join('\n')}
              onCommit={(v) => set({ fieldOptions: v.split('\n').map((s) => s.trim()).filter(Boolean).join('\n') }, 'Change options')}
            />
            {label('Value')}
            <select
              data-testid="prop-field-choice"
              className={inputCls}
              value={value}
              onChange={(e) => set({ fieldValue: e.target.value }, 'Choose option')}
            >
              <option value="">—</option>
              {options.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </>
        )}
        {ft === 'button' && (
          <>
            {label('Caption')}
            <CommitInput testId="prop-field-caption" value={String(markup.customFields?.buttonCaption ?? 'Button')} onCommit={(v) => set({ buttonCaption: v }, 'Change button caption')} />
          </>
        )}
        {ft === 'signature' && (
          <p className="text-gray-500 leading-snug">
            Unsigned signature field. It can be signed with a digital ID in Revu or Acrobat.
          </p>
        )}
      </section>
    );
  }
  return null;
};
