"use client";

import { useState } from "react";
import { phoneProblem, readPhoneInput } from "@/lib/phone";

type Props = {
  id: string;
  value: string;
  onChange: (digits: string) => void;
  className?: string;
  autoComplete?: string;
  placeholder?: string;
  required?: boolean;
};

/**
 * A 10-digit Indian mobile number field. Opens the number keypad, refuses an
 * 11th digit or letters with a message, and turns a pasted "+91 98765-43210"
 * into "9876543210". Shows what is missing once the person leaves the field.
 */
export default function PhoneInput(p: Props) {
  const [message, setMessage] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const shown = message ?? (touched && p.value ? phoneProblem(p.value) : null);
  const errorId = `${p.id}-error`;
  return (
    <>
      <input
        id={p.id}
        type="tel"
        inputMode="numeric"
        autoComplete={p.autoComplete ?? "tel-national"}
        placeholder={p.placeholder}
        required={p.required}
        value={p.value}
        aria-invalid={!!shown}
        aria-describedby={shown ? errorId : undefined}
        onChange={(e) => {
          const r = readPhoneInput(e.target.value);
          if (r.error) {
            setMessage(r.error);
            return;
          }
          setMessage(null);
          p.onChange(r.digits);
        }}
        onBlur={() => setTouched(true)}
        className={p.className}
      />
      {shown && (
        <p id={errorId} role="alert" className="basis-full text-sm font-semibold text-nonveg">
          {shown}
        </p>
      )}
    </>
  );
}
