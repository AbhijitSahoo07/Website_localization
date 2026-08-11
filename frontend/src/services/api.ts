import axios from 'axios';
import { Project, ProjectStatus, Page, ProjectSummary, TranslationSegment, PublishVersion, PublishStatus } from '../types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';

const api = axios.create({
    baseURL: API_BASE_URL,
});

// Self-healing: Clear corrupt large floating-point IDs from localStorage (from legacy code versions)
if (typeof window !== 'undefined') {
    try {
        const projects = JSON.parse(localStorage.getItem('db_projects') || '[]');
        const pages = JSON.parse(localStorage.getItem('db_pages') || '[]');
        const hasCorruptIds = projects.some(p => Number(p.id) > 1e15) || pages.some(p => Number(p.id) > 1e15);
        if (hasCorruptIds) {
            console.warn("Self-healing: Corrupt large floating-point IDs detected in localStorage. Clearing database keys...");
            localStorage.removeItem('db_projects');
            localStorage.removeItem('db_pages');
            localStorage.removeItem('db_segments');
            localStorage.removeItem('db_versions');
            localStorage.removeItem('crawler-store-persist'); // clear Zustand persist state
            window.location.reload();
        }
    } catch (e) {
        // Ignore parsing errors
    }
}

// ─── Local Database Storage Helpers ───────────────────────────────────────────

const getLocalData = <T>(key: string, defaultValue: T): T => {
    if (typeof window === 'undefined') return defaultValue;
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : defaultValue;
};

const setLocalData = <T>(key: string, data: T) => {
    if (typeof window !== 'undefined') {
        localStorage.setItem(key, JSON.stringify(data));
    }
};

const getNextId = (items: any[]): number => {
    if (!items || items.length === 0) return 1;
    const ids = items.map(item => Number(item.id)).filter(id => !isNaN(id));
    return ids.length > 0 ? Math.max(...ids) + 1 : 1;
};

const classifyPageType = (url: string, title: string): string => {
    const urlLower = url.toLowerCase();
    const titleLower = (title || "").toLowerCase();
    if (urlLower.includes("login") || urlLower.includes("signin") || titleLower.includes("log in") || titleLower.includes("sign in")) {
        return "login";
    }
    if (urlLower.includes("contact") || urlLower.includes("support")) {
        return "support";
    }
    return "content";
};

const analyzeCrawlIssues = (page: any): string[] => {
    const issues: string[] = [];
    if (page.http_status && page.http_status >= 400) {
        issues.push(`HTTP Error ${page.http_status}`);
    }
    if (page.error_message) {
        issues.push(page.error_message);
    }
    if (page.word_count === 0 && !page.error_message) {
        issues.push("Empty page content");
    }
    return issues;
};

// ─── Project Endpoints ────────────────────────────────────────────────────────

export const createProject = async (url: string, targetLanguage: string): Promise<Project> => {
    // 1. Call stateless crawler on the backend
    const response = await api.post('/projects/crawl-stateless', {
        url,
        max_depth: 2,
        max_pages: 10
    });

    const crawledPages = response.data.data;
    if (!response.data.success) {
        throw new Error(response.data.message || "Failed to crawl site");
    }

    const projects = getLocalData<any[]>('db_projects', []);
    const projectId = getNextId(projects);

    // 2. Save project to localStorage db
    const newProject: Project = {
        id: projectId,
        name: url,
        target_url: url,
        target_language: targetLanguage,
        status: 'completed', // crawl is synchronous in stateless mode
        max_pages: 10,
        max_depth: 2,
        error_message: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    };
    projects.push(newProject);
    setLocalData('db_projects', projects);

    // 3. Save pages to localStorage db
    const pages = getLocalData<any[]>('db_pages', []);
    let nextPageId = getNextId(pages);
    const newPages = crawledPages.map((p: any) => ({
        id: nextPageId++,
        project_id: projectId,
        url: p.url,
        title: p.title || "",
        http_status: p.http_status,
        word_count: p.word_count,
        detected_language: p.detected_language || "en",
        html_content: p.html_content,
        error_message: p.error_message || null,
        is_selected: true,
        translation_status: 'pending',
        crawl_timestamp: new Date().toISOString()
    }));
    pages.push(...newPages);
    setLocalData('db_pages', pages);

    return newProject;
};

export const getProjectStatus = async (projectId: number): Promise<ProjectStatus> => {
    const projects = getLocalData<any[]>('db_projects', []);
    const project = projects.find(p => p.id === projectId);
    if (!project) throw new Error("Project not found");

    const pages = getLocalData<any[]>('db_pages', []);
    const projectPages = pages.filter(p => p.project_id === projectId);
    const failedPages = projectPages.filter(p => p.error_message);

    return {
        status: project.status,
        error_message: project.error_message || null,
        pages_crawled: projectPages.length,
        failed_pages: failedPages.length,
        max_pages: project.max_pages,
        max_depth: project.max_depth
    };
};

export const getProjectPages = async (projectId: number): Promise<Page[]> => {
    const pages = getLocalData<any[]>('db_pages', []);
    const projectPages = pages.filter(p => p.project_id === projectId);

    return projectPages.map(p => ({
        id: p.id,
        project_id: p.project_id,
        url: p.url,
        title: p.title,
        http_status: p.http_status,
        word_count: p.word_count,
        detected_language: p.detected_language,
        error_message: p.error_message,
        is_selected: p.is_selected,
        translation_status: p.translation_status,
        page_type: classifyPageType(p.url, p.title),
        crawl_issues: analyzeCrawlIssues(p),
        crawl_timestamp: p.crawl_timestamp
    }));
};

export const getProjectSummary = async (projectId: number): Promise<ProjectSummary> => {
    const pages = getLocalData<any[]>('db_pages', []);
    const projectPages = pages.filter(p => p.project_id === projectId);
    const totalPages = projectPages.length;
    const totalWords = projectPages.reduce((acc, p) => acc + (p.word_count || 0), 0);
    const effortHours = Math.round((totalWords / 250) * 10) / 10;
    const successfulCrawls = projectPages.filter(p => !p.error_message && p.http_status === 200).length;
    const failedCrawls = totalPages - successfulCrawls;

    return {
        total_pages: totalPages,
        total_words: totalWords,
        estimated_effort_hours: effortHours,
        successful_crawls: successfulCrawls,
        failed_crawls: failedCrawls
    };
};

export const updatePageSelection = async (pageId: number, isSelected: boolean): Promise<any> => {
    const pages = getLocalData<any[]>('db_pages', []);
    const updatedPages = pages.map(p => p.id === pageId ? { ...p, is_selected: isSelected } : p);
    setLocalData('db_pages', updatedPages);
    return { success: true };
};

export const bulkUpdatePageSelection = async (projectId: number, pageIds: number[], isSelected: boolean): Promise<any> => {
    const pages = getLocalData<any[]>('db_pages', []);
    const updatedPages = pages.map(p => p.project_id === projectId && pageIds.includes(p.id) ? { ...p, is_selected: isSelected } : p);
    setLocalData('db_pages', updatedPages);
    return { success: true };
};

export const getPageDetails = async (pageId: number): Promise<Page> => {
    const pages = getLocalData<any[]>('db_pages', []);
    const p = pages.find(page => page.id === pageId);
    if (!p) throw new Error("Page not found");

    return {
        id: p.id,
        project_id: p.project_id,
        url: p.url,
        title: p.title,
        http_status: p.http_status,
        word_count: p.word_count,
        detected_language: p.detected_language,
        error_message: p.error_message,
        is_selected: p.is_selected,
        translation_status: p.translation_status,
        page_type: classifyPageType(p.url, p.title),
        crawl_issues: analyzeCrawlIssues(p),
        crawl_timestamp: p.crawl_timestamp
    };
};

// ─── Segment Endpoints ────────────────────────────────────────────────────────

export const extractPageSegments = async (pageId: number): Promise<TranslationSegment[]> => {
    const pages = getLocalData<any[]>('db_pages', []);
    const page = pages.find(p => p.id === pageId);
    if (!page) throw new Error("Page not found");

    // Call stateless extractor on the backend
    const response = await api.post('/pages/extract-stateless', {
        html_content: page.html_content
    });

    if (!response.data.success) {
        throw new Error("Failed to extract segments");
    }

    const projects = getLocalData<any[]>('db_projects', []);
    const project = projects.find(p => p.id === page.project_id);
    const targetLang = project ? project.target_language : "Spanish";

    const extracted = response.data.data;

    // Remove existing segments for this page
    const segments = getLocalData<any[]>('db_segments', []);
    const filteredSegments = segments.filter(s => s.page_id !== pageId);
    let nextSegmentId = getNextId(segments);

    // Save newly extracted segments
    const newSegments: TranslationSegment[] = extracted.map((s: any) => ({
        id: nextSegmentId++,
        page_id: pageId,
        source_text: s.source_text,
        source_language: "en",
        translated_text: "",
        target_language: targetLang,
        selector: s.selector,
        status: "Pending" as const,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    }));

    filteredSegments.push(...newSegments);
    setLocalData('db_segments', filteredSegments);

    // Update page translation status
    const updatedPages = pages.map(p => p.id === pageId ? { ...p, translation_status: 'extracted' } : p);
    setLocalData('db_pages', updatedPages);

    return newSegments;
};

export const translatePageSegments = async (pageId: number): Promise<TranslationSegment[]> => {
    const pages = getLocalData<any[]>('db_pages', []);
    const page = pages.find(p => p.id === pageId);
    if (!page) throw new Error("Page not found");

    const projects = getLocalData<any[]>('db_projects', []);
    const project = projects.find(p => p.id === page.project_id);
    const targetLang = project ? project.target_language : "Spanish";

    const segments = getLocalData<any[]>('db_segments', []);
    const pageSegments = segments.filter(s => s.page_id === pageId);

    // Find segments that need machine translation (either Pending or empty translated_text)
    const pendingSegments = pageSegments.filter(s => s.status === 'Pending' || !s.translated_text);

    if (pendingSegments.length > 0) {
        // Call stateless translator on the backend
        const response = await api.post('/pages/translate-stateless', {
            segments: pendingSegments.map(s => ({
                source_text: s.source_text,
                selector: s.selector
            })),
            target_language: targetLang
        });

        if (!response.data.success) {
            throw new Error("Failed to translate segments");
        }

        const translations = response.data.data; // array of TranslatedSegmentItem

        // Update translations in local db
        const updatedSegments = segments.map(s => {
            if (s.page_id === pageId) {
                const match = translations.find((t: any) => t.source_text === s.source_text && t.selector === s.selector);
                if (match) {
                    return {
                        ...s,
                        translated_text: match.translated_text,
                        status: 'Machine Translated' as const,
                        updated_at: new Date().toISOString()
                    };
                }
            }
            return s;
        });

        setLocalData('db_segments', updatedSegments);
    }

    // Update page translation status
    const updatedPages = pages.map(p => p.id === pageId ? { ...p, translation_status: 'translated' } : p);
    setLocalData('db_pages', updatedPages);

    const finalSegments = getLocalData<any[]>('db_segments', []);
    return finalSegments.filter(s => s.page_id === pageId);
};

export const getPageSegments = async (pageId: number): Promise<TranslationSegment[]> => {
    const segments = getLocalData<any[]>('db_segments', []);
    return segments.filter(s => s.page_id === pageId);
};

export const updateSegmentTranslation = async (segmentId: number, translatedText: string): Promise<TranslationSegment> => {
    const segments = getLocalData<any[]>('db_segments', []);
    let updated: any = null;

    const updatedSegments = segments.map(s => {
        if (s.id === segmentId) {
            updated = {
                ...s,
                translated_text: translatedText,
                status: 'Machine Translated' as const,
                updated_at: new Date().toISOString()
            };
            return updated;
        }
        return s;
    });

    if (!updated) throw new Error("Segment not found");
    setLocalData('db_segments', updatedSegments);
    return updated;
};

export const approveSegmentTranslation = async (segmentId: number): Promise<TranslationSegment> => {
    const segments = getLocalData<any[]>('db_segments', []);
    let updated: any = null;

    const updatedSegments = segments.map(s => {
        if (s.id === segmentId) {
            updated = {
                ...s,
                status: 'Approved' as const,
                updated_at: new Date().toISOString()
            };
            return updated;
        }
        return s;
    });

    if (!updated) throw new Error("Segment not found");
    setLocalData('db_segments', updatedSegments);
    return updated;
};

export const regenerateSegmentTranslation = async (segmentId: number): Promise<TranslationSegment> => {
    const segments = getLocalData<any[]>('db_segments', []);
    const s = segments.find(seg => seg.id === segmentId);
    if (!s) throw new Error("Segment not found");

    // Call stateless translator for this single segment
    const response = await api.post('/pages/translate-stateless', {
        segments: [{ source_text: s.source_text, selector: s.selector }],
        target_language: s.target_language
    });

    if (!response.data.success || response.data.data.length === 0) {
        throw new Error("Failed to translate segment");
    }

    const translatedText = response.data.data[0].translated_text;

    const updatedSegments = segments.map(seg => {
        if (seg.id === segmentId) {
            return {
                ...seg,
                translated_text: translatedText,
                status: 'Machine Translated' as const,
                updated_at: new Date().toISOString()
            };
        }
        return seg;
    });

    setLocalData('db_segments', updatedSegments);
    return updatedSegments.find(seg => seg.id === segmentId);
};

export const resetPageSegments = async (pageId: number): Promise<void> => {
    const segments = getLocalData<any[]>('db_segments', []);
    const filtered = segments.filter(s => s.page_id !== pageId);
    setLocalData('db_segments', filtered);

    const pages = getLocalData<any[]>('db_pages', []);
    const updatedPages = pages.map(p => p.id === pageId ? { ...p, translation_status: 'pending' } : p);
    setLocalData('db_pages', updatedPages);
};

// ─── Publish Endpoints ────────────────────────────────────────────────────────

export const publishProject = async (projectId: number): Promise<PublishVersion> => {
    const projects = getLocalData<any[]>('db_projects', []);
    const project = projects.find(p => p.id === projectId);
    if (!project) throw new Error("Project not found");

    const pages = getLocalData<any[]>('db_pages', []);
    const projectPages = pages.filter(p => p.project_id === projectId && p.is_selected);
    const pageIds = projectPages.map(p => p.id);

    const segments = getLocalData<any[]>('db_segments', []);
    const projectSegments = segments.filter(s => pageIds.includes(s.page_id));

    // Compile translations payload: list of {selector, original, translated}
    const translations = projectSegments
        .filter(s => s.translated_text)
        .map(s => ({
            selector: s.selector,
            original: s.source_text,
            translated: s.translated_text
        }));

    // Post published translations statelessly to the backend to write the static JSON file
    const response = await api.post('/projects/publish-stateless', {
        project_id: projectId,
        target_language: project.target_language,
        translations
    });

    if (!response.data.success) {
        throw new Error("Failed to publish project");
    }

    const versions = getLocalData<any[]>('db_versions', []);
    const nextVersionId = getNextId(versions);
    const versionNum = versions.filter(v => v.project_id === projectId).length + 1;

    const newVersion: PublishVersion = {
        id: nextVersionId,
        project_id: projectId,
        version: versionNum,
        status: "Published",
        total_segments: translations.length,
        published_at: new Date().toISOString(),
        created_at: new Date().toISOString()
    };

    versions.push(newVersion);
    setLocalData('db_versions', versions);

    return newVersion;
};

export const republishProject = async (projectId: number): Promise<PublishVersion> => {
    return publishProject(projectId);
};

export const getPublishStatus = async (projectId: number): Promise<PublishStatus> => {
    const versions = getLocalData<any[]>('db_versions', []);
    const projectVersions = versions.filter(v => v.project_id === projectId).sort((a, b) => b.version - a.version);

    const pages = getLocalData<any[]>('db_pages', []);
    const projectPages = pages.filter(p => p.project_id === projectId && p.is_selected);
    const pageIds = projectPages.map(p => p.id);

    const segments = getLocalData<any[]>('db_segments', []);
    const projectSegments = segments.filter(s => pageIds.includes(s.page_id));
    const total = projectSegments.length;
    const approved = projectSegments.filter(s => s.status === 'Approved').length;

    if (projectVersions.length === 0) {
        return {
            is_published: false,
            current_version: null,
            published_at: null,
            total_approved: approved,
            total_segments: total,
            project_id: projectId
        };
    }

    const latest = projectVersions[0];
    return {
        is_published: true,
        current_version: latest.version,
        published_at: latest.published_at,
        total_approved: approved,
        total_segments: total,
        project_id: projectId
    };
};

export const getPublishVersions = async (projectId: number): Promise<PublishVersion[]> => {
    const versions = getLocalData<any[]>('db_versions', []);
    return versions.filter(v => v.project_id === projectId).sort((a, b) => b.version - a.version);
};

export const getScriptSnippet = async (projectId: number): Promise<{ snippet: string; project_id: number }> => {
    const response = await api.get(`/projects/${projectId}/script`);
    return response.data.data;
};
