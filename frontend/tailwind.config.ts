import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  prefix: '',
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: { '2xl': '1400px' },
    },
    extend: {
      colors: {
        // shadcn/ui CSS variable tokens
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        // Ubicar Rent design system — usables directamente como clases Tailwind
        'ubicar-primary': '#407EC9',
        // El azul oscuro de la marca. Estaba hardcodeado 30 veces en el sitio
        // público y no existía en el panel — por eso los dos no matcheaban.
        // Con texto blanco encima da 10,7 de contraste.
        'ubicar-dark': '#1B3F6B',
        'ubicar-secondary': '#8BB8E8',
        surface: '#F0F6FD',
        'ubicar-border': '#D0E4F5',
        'ubicar-text': '#1A2A3A',
        'ubicar-muted': '#6B8CAE',
        // ─── La escala de urgencia ────────────────────────────────────
        //
        // Cinco niveles, todos como bloque sólido con texto blanco, ordenados
        // por qué tan urgente es lo que señalan. No son colores elegidos por
        // gusto: son los significados que la gente ya trae aprendidos de
        // cualquier aplicación (gris = no arrancó, azul = información y
        // progreso, verde = correcto, ámbar = prestá atención, rojo = error).
        // Lo único propio es el azul, que es el de Ubicar.
        //
        // **Los cinco pasan el contraste con texto blanco** (mínimo 4,5 según
        // WCAG). Los de antes NO: #D97706 daba 3,19 · #F59E0B 2,15 ·
        // #059669 3,77 · #407EC9 4,16. Sólo el rojo estaba bien.
        //
        // 1 · inactivo     #475569  7,6   no arrancó, fuera de juego
        // 2 · info         #1B5FA8  6,5   dato, estado normal, en curso
        // 3 · success      #047857  5,5   cerrado, cobrado, al día
        // 4 · warning      #B45309  5,0   hay un reloj corriendo
        // 5 · danger       #B91C1C  6,5   frena la operación o ya falló
        //
        // Gris y azul comparten tono a propósito: los separa la saturación
        // (32% contra 84%). El gris se ve lavado, que es lo que "inactivo"
        // tiene que transmitir — la misma señal de un botón deshabilitado.
        inactivo: { DEFAULT: '#475569', bg: '#F1F5F9' },
        info: { DEFAULT: '#1B5FA8', bg: '#E8F1FB' },
        success: { DEFAULT: '#047857', bg: '#D1FAE5' },
        // **El naranja se oscureció de #D97706 a #B45309.**
        //
        // No es un cambio estético: el anterior daba 3,19 de contraste contra
        // el texto blanco que lleva encima, y el mínimo legible es 4,5. Todo
        // bloque `bg-warning` con texto blanco —que son varios— se leía con
        // esfuerzo, más todavía en la pantalla del mostrador con luz de día.
        // Este da 5,02.
        //
        // El `bg` claro (#FEF3C7) no se toca: se usa como fondo con texto
        // oscuro encima, donde nunca hubo problema.
        warning: { DEFAULT: '#B45309', bg: '#FEF3C7' },
        danger: { DEFAULT: '#B91C1C', bg: '#FEE2E2' },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};

export default config;
