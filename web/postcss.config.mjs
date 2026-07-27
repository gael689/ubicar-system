// Tailwind 3: el proyecto usa `tailwind.config.ts` con variables HSL, igual
// que la landing original. Se mantuvo la v3 a propósito para que el diseño ya
// aprobado se preserve exacto, en vez de migrar los tokens a la sintaxis
// CSS-first de Tailwind 4 y arriesgar deriva visual.
const config = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};

export default config;
