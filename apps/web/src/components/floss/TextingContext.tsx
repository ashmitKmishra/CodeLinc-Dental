import { createContext, useContext } from 'react';

/** Anything in the app can open the texting popup (the Overview banner, the sidebar block). */
export const TextingContext = createContext<() => void>(() => {});
export const useOpenTexting = () => useContext(TextingContext);
