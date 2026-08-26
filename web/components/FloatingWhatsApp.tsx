"use client";

import { WHATSAPP_GENERAL } from "@/lib/constants";

import { trackLeadEvent } from "@/lib/meta-pixel";
import { IconoWhatsApp } from "@/components/IconoWhatsApp";

const FloatingWhatsApp = () => {
  return (
    <a
      href={WHATSAPP_GENERAL}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => trackLeadEvent("flotante:whatsapp")}
      className="fixed bottom-6 right-6 z-50 flex items-center justify-center w-[60px] h-[60px] rounded-full bg-[#25D366] text-white shadow-[0_4px_20px_rgba(37,211,102,0.35)] hover:shadow-[0_6px_28px_rgba(37,211,102,0.5)] hover:-translate-y-1 transition-all duration-300 group"
      aria-label="Contactar por WhatsApp"
    >
      {/* Pulse ring */}
      <span className="absolute inset-0 rounded-full bg-[#25D366]/40 animate-wa-pulse" />

      <IconoWhatsApp
        size={28}
        className="relative z-10 transition-transform duration-200 group-hover:scale-110"
      />
    </a>
  );
};

export default FloatingWhatsApp;