"use client";
/**
 * components/vendor/TagsInput.tsx
 * Input de palavras-chave (tags) para produtos no painel do vendor.
 *
 * Features:
 *  - Adiciona tag com Enter ou vírgula
 *  - Remove tag com clique no X
 *  - Limita a 10 tags (evita spam no índice de pesquisa)
 *  - Normaliza: lowercase, sem espaços duplos, sem caracteres especiais
 *  - Sugestões pré-definidas clicáveis
 *  - Acessível: ARIA, teclado completo
 *
 * Uso:
 *   <TagsInput
 *     value={tags}
 *     onChange={setTags}
 *     suggestions={["crm", "automação", "b2b"]}
 *   />
 */

import React, { useState, useRef, KeyboardEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Tag, X } from "lucide-react";

const MAX_TAGS    = 10;
const MAX_TAG_LEN = 30;

function normalizeTag(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\-àáâãéêíóôõúüç]/g, "")
    .slice(0, MAX_TAG_LEN);
}

interface TagsInputProps {
  value:        string[];
  onChange:     (tags: string[]) => void;
  suggestions?: string[];
  placeholder?: string;
  label?:       string;
  helpText?:    string;
  disabled?:    boolean;
}

export default function TagsInput({
  value        = [],
  onChange,
  suggestions  = [],
  placeholder  = "Ex: crm, vendas, automação…",
  label        = "Palavras-Chave (Tags)",
  helpText     = "Escreva uma palavra e prima Enter. As tags ajudam compradores a encontrar o seu produto.",
  disabled     = false,
}: TagsInputProps) {
  const [inputVal, setInputVal] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const addTag = (raw: string) => {
    const tag = normalizeTag(raw);
    if (!tag || value.includes(tag) || value.length >= MAX_TAGS) return;
    onChange([...value, tag]);
    setInputVal("");
  };

  const removeTag = (tag: string) => {
    onChange(value.filter(t => t !== tag));
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(inputVal);
    }
    if (e.key === "Backspace" && !inputVal && value.length > 0) {
      removeTag(value[value.length - 1]);
    }
  };

  const unusedSuggestions = suggestions.filter(s => !value.includes(s)).slice(0, 8);

  return (
    <div>
      {label && (
        <label
          className="flex items-center gap-1.5 text-xs font-semibold mb-1.5"
          style={{ color: "var(--text-secondary)" }}
          onClick={() => inputRef.current?.focus()}
        >
          <Tag size={12} style={{ color: "var(--brand)" }} />
          {label}
          <span className="font-normal opacity-50">({value.length}/{MAX_TAGS})</span>
        </label>
      )}

      {/* Container das tags + input */}
      <div
        className="flex flex-wrap gap-1.5 min-h-[48px] rounded-xl px-3 py-2.5 cursor-text transition-all"
        style={{
          background:  "var(--surface-2)",
          border:      `1px solid ${inputRef.current === document.activeElement ? "rgba(34,212,160,0.4)" : "var(--border-default)"}`,
        }}
        onClick={() => inputRef.current?.focus()}
      >
        {/* Tags */}
        <AnimatePresence>
          {value.map(tag => (
            <motion.span
              key={tag}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold"
              style={{
                background:  "rgba(34,212,160,0.1)",
                border:      "1px solid rgba(34,212,160,0.2)",
                color:       "var(--brand)",
              }}
            >
              #{tag}
              {!disabled && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); removeTag(tag); }}
                  className="rounded-full hover:bg-current/20 transition-colors p-0.5"
                  aria-label={`Remover tag ${tag}`}
                >
                  <X size={10} />
                </button>
              )}
            </motion.span>
          ))}
        </AnimatePresence>

        {/* Input */}
        {!disabled && value.length < MAX_TAGS && (
          <input
            ref={inputRef}
            type="text"
            value={inputVal}
            onChange={e => setInputVal(e.target.value.replace(",", ""))}
            onKeyDown={handleKeyDown}
            onBlur={() => { if (inputVal.trim()) addTag(inputVal); }}
            placeholder={value.length === 0 ? placeholder : ""}
            className="flex-1 min-w-[120px] bg-transparent outline-none text-xs"
            style={{ color: "var(--text-primary)" }}
            aria-label="Adicionar tag"
          />
        )}
      </div>

      {/* Help text */}
      {helpText && (
        <p className="text-[11px] mt-1.5" style={{ color: "var(--text-faint)" }}>
          {helpText}
        </p>
      )}

      {/* Sugestões clicáveis */}
      {unusedSuggestions.length > 0 && !disabled && (
        <div className="flex flex-wrap gap-1.5 mt-2.5">
          <span className="text-[11px]" style={{ color: "var(--text-faint)" }}>Sugestões:</span>
          {unusedSuggestions.map(s => (
            <button
              key={s}
              type="button"
              onClick={() => addTag(s)}
              disabled={value.length >= MAX_TAGS}
              className="text-[11px] px-2 py-0.5 rounded-lg transition-all hover:border-brand"
              style={{
                background:  "var(--surface-3)",
                border:      "1px solid var(--border-subtle)",
                color:       "var(--text-muted)",
              }}
            >
              +{s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
