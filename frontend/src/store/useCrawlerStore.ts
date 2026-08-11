import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ProjectStatus } from '../types';

type AppView = 'form' | 'progress' | 'dashboard' | 'editor' | 'publish';

interface CrawlerState {
    projectId: number | null;
    status: ProjectStatus | null;
    isPolling: boolean;
    view: AppView;
    activePageId: number | null;
    setProjectId: (id: number) => void;
    setStatus: (status: ProjectStatus) => void;
    startPolling: () => void;
    stopPolling: () => void;
    setView: (view: AppView) => void;
    setActivePageId: (id: number | null) => void;
    reset: () => void;
}

export const useCrawlerStore = create<CrawlerState>()(
    persist(
        (set) => ({
            projectId: null,
            status: null,
            isPolling: false,
            view: 'form',
            activePageId: null,
            setProjectId: (id) => set({ projectId: id, view: 'progress' }),
            setStatus: (status) => set({ status }),
            startPolling: () => set({ isPolling: true }),
            stopPolling: () => set({ isPolling: false }),
            setView: (view) => set({ view }),
            setActivePageId: (id) => set({ activePageId: id, view: id ? 'editor' : 'dashboard' }),
            reset: () => set({ projectId: null, status: null, isPolling: false, view: 'form', activePageId: null }),
        }),
        {
            name: 'crawler-store-persist', // unique storage key
        }
    )
);



