import { 
  ProfileDTO, 
  BasicDataDTO, 
  ExperienceDTO, 
  EducationDTO, 
  ProjectDTO, 
  SkillDTO, 
  ReferenceDTO,
  ParseProgressEvent,
  SummaryDTO
} from "../types/profile";

export class ProfileService {
  /**
   * Fetch complete user profile
   */
  static async getProfile(): Promise<ProfileDTO> {
    const response = await fetch("/api/profile");
    if (!response.ok) {
      throw new Error(`Failed to fetch profile: ${response.statusText}`);
    }
    return response.json();
  }

  /**
   * Update basic data
   */
  static async updateBasicData(data: Partial<BasicDataDTO> & { summaries?: SummaryDTO[] }): Promise<BasicDataDTO> {
    const response = await fetch("/api/profile/basic", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      throw new Error(`Failed to update basic data: ${response.statusText}`);
    }
    return response.json();
  }

  /**
   * Experiences CRUD
   */
  static async createExperience(data: Partial<ExperienceDTO>): Promise<ExperienceDTO> {
    const response = await fetch("/api/profile/experiences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      throw new Error(`Failed to create experience: ${response.statusText}`);
    }
    return response.json();
  }

  static async updateExperience(id: string, data: Partial<ExperienceDTO>): Promise<ExperienceDTO> {
    const response = await fetch(`/api/profile/experiences/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      throw new Error(`Failed to update experience: ${response.statusText}`);
    }
    return response.json();
  }

  static async deleteExperience(id: string): Promise<void> {
    const response = await fetch(`/api/profile/experiences/${id}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      throw new Error(`Failed to delete experience: ${response.statusText}`);
    }
  }

  /**
   * Education CRUD
   */
  static async createEducation(data: Partial<EducationDTO>): Promise<EducationDTO> {
    const response = await fetch("/api/profile/education", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      throw new Error(`Failed to create education: ${response.statusText}`);
    }
    return response.json();
  }

  static async updateEducation(id: string, data: Partial<EducationDTO>): Promise<EducationDTO> {
    const response = await fetch(`/api/profile/education/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      throw new Error(`Failed to update education: ${response.statusText}`);
    }
    return response.json();
  }

  static async deleteEducation(id: string): Promise<void> {
    const response = await fetch(`/api/profile/education/${id}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      throw new Error(`Failed to delete education: ${response.statusText}`);
    }
  }

  /**
   * Projects CRUD
   */
  static async createProject(data: Partial<ProjectDTO>): Promise<ProjectDTO> {
    const response = await fetch("/api/profile/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      throw new Error(`Failed to create project: ${response.statusText}`);
    }
    return response.json();
  }

  static async updateProject(id: string, data: Partial<ProjectDTO>): Promise<ProjectDTO> {
    const response = await fetch(`/api/profile/projects/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      throw new Error(`Failed to update project: ${response.statusText}`);
    }
    return response.json();
  }

  static async deleteProject(id: string): Promise<void> {
    const response = await fetch(`/api/profile/projects/${id}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      throw new Error(`Failed to delete project: ${response.statusText}`);
    }
  }

  /**
   * Skills and References
   */
  static async updateSkills(skills: SkillDTO[]): Promise<SkillDTO[]> {
    const response = await fetch("/api/profile/skills", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(skills),
    });
    if (!response.ok) {
      throw new Error(`Failed to update skills: ${response.statusText}`);
    }
    return response.json();
  }

  static async suggestSkills(): Promise<SkillDTO[]> {
    const response = await fetch("/api/profile/skills/suggest", {
      method: "POST",
    });
    if (!response.ok) {
      throw new Error(`Failed to suggest skills: ${response.statusText}`);
    }
    return response.json();
  }

  static async updateReferences(references: ReferenceDTO[]): Promise<ReferenceDTO[]> {
    const response = await fetch("/api/profile/references", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(references),
    });
    if (!response.ok) {
      throw new Error(`Failed to update references: ${response.statusText}`);
    }
    return response.json();
  }

  /**
   * Upload CV file and stream progress events
   */
  static async parseCV(
    file: File,
    onProgress: (event: ParseProgressEvent) => void,
    onError: (error: string) => void,
    onComplete: () => void
  ): Promise<void> {
    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/profile/parse", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Upload failed with status ${response.status}`);
      }

      if (!response.body) {
        throw new Error("No response body received from server");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        // Keep the last partial line in the buffer
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith("data: ")) {
            const dataStr = trimmed.slice(6);
            try {
              const parsed = JSON.parse(dataStr) as ParseProgressEvent;
              onProgress(parsed);
              if (parsed.phase === "error") {
                onError(parsed.error);
                return;
              }
            } catch (err) {
              console.error("Failed to parse SSE event data:", err, dataStr);
            }
          }
        }
      }

      onComplete();
    } catch (err) {
      const error = err as Error;
      console.error("parseCV error:", error);
      onError(error.message || "An error occurred during CV parsing.");
    }
  }

  /**
   * Triggers the AI-powered profile synchronization (text cleaning & embedding generation)
   */
  static async syncProfile(): Promise<{ success: boolean; cleanedText: string }> {
    const response = await fetch("/api/profile/sync", {
      method: "POST",
    });
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || `Failed to sync profile with AI: ${response.statusText}`);
    }
    return response.json();
  }
}
