"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { NavList } from "./nav/NavList";
import { RefreshHubspotButton } from "./RefreshHubspotButton";

// Barra superior sticky: hamburguesa + logo en móvil (drawer de navegación) y
// el botón "Actualizar HubSpot" siempre a mano. En escritorio el menú vive en
// el Sidebar; aquí solo queda el botón a la derecha.
export function Topbar() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-[var(--border)] bg-[var(--panel)]/85 px-4 backdrop-blur-md sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setOpen(true)}
            className="rounded-lg p-2 text-[var(--muted)] hover:bg-[var(--subtle)] lg:hidden"
            aria-label="Abrir menú"
          >
            <Menu className="h-5 w-5" />
          </button>
          <Link href="/" className="flex items-center gap-2 lg:hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/atri-app-icon.png" alt="atri" className="h-7 w-7 rounded-lg" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/atri-wordmark.png" alt="atri" className="h-[15px] w-auto" />
          </Link>
        </div>

        <div className="flex items-center gap-3">
          <RefreshHubspotButton />
        </div>
      </header>

      {/* Drawer móvil */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-[var(--color-gray-900)]/40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-0 flex h-full w-64 flex-col bg-[var(--surface-sidebar)] shadow-lg">
            <div className="flex items-center justify-between px-5 pb-4 pt-6">
              <Link href="/" onClick={() => setOpen(false)} className="flex items-center gap-2.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/brand/atri-app-icon.png" alt="atri" className="h-9 w-9 rounded-xl" />
                <div>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/brand/atri-wordmark.png" alt="atri" className="h-[15px] w-auto" />
                  <div className="mt-1.5 text-[10px] font-medium uppercase tracking-wider text-[var(--faint)]">
                    GTM · Revenue
                  </div>
                </div>
              </Link>
              <button
                onClick={() => setOpen(false)}
                className="rounded-lg p-2 text-[var(--muted)] hover:bg-[var(--subtle)]"
                aria-label="Cerrar menú"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <NavList onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
