import axios from 'axios';
import { Project, ProjectStatus, Page, ProjectSummary, TranslationSegment, PublishVersion, PublishStatus } from '../types';


const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';

const api = axios.create({
    baseURL: API_BASE_URL,
});

export const createProject = async (url: string, targetLanguage: string): Promise<Project> => {
    const response = await api.post('/projects/', {
        url,
        target_language: targetLanguage,
    });
    return response.data.data;
};

export const getProjectStatus = async (projectId: number): Promise<ProjectStatus> => {
    const response = await api.get(`/projects/${projectId}/status`);
    return response.data.data;
};

export const getProjectPages = async (projectId: number): Promise<Page[]> => {
    const response = await api.get(`/projects/${projectId}/pages`);
    return response.data.data;
};

export const getProjectSummary = async (projectId: number): Promise<ProjectSummary> => {
    const response = await api.get(`/projects/${projectId}/summary`);
    return response.data.data;
};

export const updatePageSelection = async (pageId: number, isSelected: boolean): Promise<any> => {
    const response = await api.put(`/pages/${pageId}/selection`, {
        is_selected: isSelected,
    });
    return response.data.data;
};

export const bulkUpdatePageSelection = async (projectId: number, pageIds: number[], isSelected: boolean): Promise<any> => {
    const response = await api.post(`/projects/${projectId}/pages/selection`, {
        page_ids: pageIds,
        is_selected: isSelected,
    });
    return response.data.data;
};

export const getPageDetails = async (pageId: number): Promise<Page> => {
    const response = await api.get(`/pages/${pageId}`);
    return response.data.data;
};

// ==========================================
// MODULE 3 SEGMENT ENDPOINTS
// ==========================================

export const extractPageSegments = async (pageId: number): Promise<TranslationSegment[]> => {
    const response = await api.post(`/pages/${pageId}/extract`);
    return response.data.data;
};

export const translatePageSegments = async (pageId: number): Promise<TranslationSegment[]> => {
    const response = await api.post(`/pages/${pageId}/translate`);
    return response.data.data;
};

export const getPageSegments = async (pageId: number): Promise<TranslationSegment[]> => {
    const response = await api.get(`/pages/${pageId}/segments`);
    return response.data.data;
};

export const updateSegmentTranslation = async (segmentId: number, translatedText: string): Promise<TranslationSegment> => {
    const response = await api.put(`/segments/${segmentId}`, {
        translated_text: translatedText,
    });
    return response.data.data;
};

export const approveSegmentTranslation = async (segmentId: number): Promise<TranslationSegment> => {
    const response = await api.post(`/segments/${segmentId}/approve`);
    return response.data.data;
};

export const regenerateSegmentTranslation = async (segmentId: number): Promise<TranslationSegment> => {
    const response = await api.post(`/segments/${segmentId}/regenerate`);
    return response.data.data;
};

export const resetPageSegments = async (pageId: number): Promise<void> => {
    await api.post(`/pages/${pageId}/reset-segments`);
};

// ==========================================
// MODULE 4 PUBLISH ENDPOINTS
// ==========================================

export const publishProject = async (projectId: number): Promise<PublishVersion> => {
    const response = await api.post(`/projects/${projectId}/publish`);
    return response.data.data;
};

export const republishProject = async (projectId: number): Promise<PublishVersion> => {
    const response = await api.post(`/projects/${projectId}/republish`);
    return response.data.data;
};

export const getPublishStatus = async (projectId: number): Promise<PublishStatus> => {
    const response = await api.get(`/projects/${projectId}/publish-status`);
    return response.data.data;
};

export const getPublishVersions = async (projectId: number): Promise<PublishVersion[]> => {
    const response = await api.get(`/projects/${projectId}/versions`);
    return response.data.data;
};

export const getScriptSnippet = async (projectId: number): Promise<{ snippet: string; project_id: number }> => {
    const response = await api.get(`/projects/${projectId}/script`);
    return response.data.data;
};
