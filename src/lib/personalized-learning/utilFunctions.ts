import { ChatHistoryType, ModuleType, PagesType, SetIntroductionType, SetStudyPlatformType, StudyPlatformType } from "@/types/personalized-learning";

export const pageVariants = (durationStart: number, durationEnd?: number) => ({
    initial: { opacity: 0, scale: 0.98 },
    in: { opacity: 1, scale: 1 },
    out: { opacity: 0, scale: 0.98 }
});

export const pageTransition = (duration: number) => ({
    type: 'spring',
    stiffness: 300,
    damping: 30,
    duration,
});

export const validateJSON = (text: string): boolean => {
    try {
        const jsonStart = text.indexOf('[');
        const jsonEnd = text.lastIndexOf(']');
        const cleanedString = text.slice(jsonStart, jsonEnd + 1).replace(/[\n\r\t\b\f]/g, '').replace(/[\x00-\x1F\x7F-\x9F]/g, '');
        const parsed = JSON.parse(cleanedString);
        return parsed && typeof parsed === 'object';
    } catch (e) {
        return false;
    }
};

export const addHistoryChat = (
    history: ChatHistoryType[],
    setHistory: (history: ChatHistoryType[]) => void,
    role: 'user' | 'model',
    string: string,
) => {
    const newHistory: ChatHistoryType = {
        role: role,
        parts: [{ text: string }],
    };

    setHistory([...history, newHistory]);
};

export const addStoriesChat = (
    history: ChatHistoryType[],
    setHistory: (history: ChatHistoryType[]) => void,
    user: string,
    model: string,
) => {
    const newUserHistory: ChatHistoryType = {
        role: 'user',
        parts: [{ text: user }],
    };
    const newModelHistory: ChatHistoryType = {
        role: 'model',
        parts: [{ text: model }],
    };

    setHistory([...history, newUserHistory, newModelHistory]);
};

export const cleanAndConvertPlanoEstudo = (planoEstudoString: string) => {
    const jsonStart = planoEstudoString.indexOf('[');
    const jsonEnd = planoEstudoString.lastIndexOf(']');
    const cleanedString = planoEstudoString.slice(jsonStart, jsonEnd + 1).replace(/[\n\r\t\b\f]/g, '').replace(/[\x00-\x1F\x7F-\x9F]/g, '');
    const planoEstudo = JSON.parse(cleanedString);

    return planoEstudo;
}

export const addPropertiesToModules = (modules: any[]): ModuleType[] => {
    return modules.map(module => ({
        ...module,
        content: [],
        isOpen: false,
        chatHistory: [],
    }));
}

export const generateModules = (
    model: string,
    studyPlatform: StudyPlatformType,
    setStudyPlatform: SetStudyPlatformType,
) => {
    const cleanedModules = cleanAndConvertPlanoEstudo(model);
    const newModules = addPropertiesToModules(cleanedModules);
    setStudyPlatform({
        ...studyPlatform,
        show: true,
        modulos: [
            ...studyPlatform.modulos,
            ...newModules
        ]
    });
};

export const generateModule = (
    model: string,
    studyPlatform: StudyPlatformType,
    setStudyPlatform: SetStudyPlatformType,
) => {
    const cleanedModule = cleanAndConvertPlanoEstudo(model);
    const updatedModules = [...studyPlatform.modulos];
    updatedModules[studyPlatform.actModule] = {
        ...updatedModules[studyPlatform.actModule],
        isOpen: true,
        content: [
            ...updatedModules[studyPlatform.actModule].content,
            ...cleanedModule
        ]
    };

    setStudyPlatform(prevState => ({
        ...prevState,
        modulos: updatedModules
    }));
};

export const resetContext = (
    setIntroduction: SetIntroductionType,
    setStudyPlatform: SetStudyPlatformType,
) => {
    setStudyPlatform({
        show: false,
        isGettingModels: false,
        isGettingModulo: false,
        isLoading: false,
        actModule: 0,
        modulos: [],
    });
    setIntroduction(prevState => ({
        ...prevState,
        show: true,
        isLoading: false,
        actPage: 3,
        pages: {
            page1: {
                input: true,
                button: true,
                visited: true,
            },
            page2: {
                input: true,
                button: true,
                visited: true,
            },
            page3: {
                input: true,
                button: true,
                visited: true,
            },
        } as PagesType,
    }));
};