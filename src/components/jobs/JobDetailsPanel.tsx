"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  Space,
  Tag,
  Typography,
  Spin,
  Button,
  List,
  Divider,
} from "antd";
import {
  MapPin,
  Briefcase,
  Calendar,
  Globe,
  AlertCircle,
  Sparkles,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Lightbulb,
  FileText,
  ListChecks,
  Ban,
} from "lucide-react";

const { Title, Text, Paragraph } = Typography;

interface JobFactsSummary {
  niceToHave: string[];
  softSkills: string[];
  seniority: string | null;
  yearsExperienceMin: number | null;
  workMode: string | null;
  isWorldwide: boolean | null;
  requiresUsWorkAuth: boolean | null;
  providesRelocationVisa: boolean | null;
  employmentType: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  currency: string | null;
}

interface JobListing {
  id: string;
  title: string;
  company: string;
  url: string;
  location?: string[] | string | null;
  locationType?: string | null;
  jobType?: string | null;
  experienceLevel?: string | null;
  fullDescription?: string | null;
  isFullDescriptionFetched: boolean;
  postedAt?: Date | string | null;
  matchedSkills?: string[];
  missingSkills?: string[];
  niceToHaveMatched?: string[];
  niceToHaveMissing?: string[];
  softSkillsMatched?: string[];
  softSkillsMissing?: string[];
  disqualified?: boolean;
  disqualifyReason?: string | null;
  jobFacts?: JobFactsSummary | null;
}

function formatBoolean(value: boolean | null | undefined): string {
  if (value === null || value === undefined) return "Not specified";
  return value ? "Yes" : "No";
}

function formatSalaryRange(facts: JobFactsSummary | null | undefined): string {
  if (!facts || (facts.salaryMin == null && facts.salaryMax == null)) {
    return "Not specified";
  }
  const currency = facts.currency ?? "";
  if (facts.salaryMin != null && facts.salaryMax != null) {
    return `${currency} ${facts.salaryMin.toLocaleString()} - ${facts.salaryMax.toLocaleString()}`.trim();
  }
  const value = facts.salaryMin ?? facts.salaryMax;
  return `${currency} ${value!.toLocaleString()}`.trim();
}

interface JobDetailsPanelProps {
  job: JobListing;
}

interface AnalysisData {
  strengths: string[];
  weaknesses: string[];
  missingSkills: string[];
  verdict: "APPLY" | "CAUTION" | "IGNORE";
  justification: string;
}

export default function JobDetailsPanel({ job }: JobDetailsPanelProps) {
  const router = useRouter();
  const [analysis, setAnalysis] = useState<AnalysisData | null>(null);
  const [checkingCache, setCheckingCache] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check if job analysis is already cached when job changes
  useEffect(() => {
    setAnalysis(null);
    setError(null);
    if (!job?.id) return;

    setCheckingCache(true);
    fetch(`/api/jobs/${job.id}/analyze`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to check cache");
        return res.json();
      })
      .then((data) => {
        if (data.cached && data.analysis) {
          setAnalysis(data.analysis);
        }
      })
      .catch((err) => {
        console.error("Error checking cache:", err);
      })
      .finally(() => {
        setCheckingCache(false);
      });
  }, [job.id]);

  const handleStartAnalysis = async () => {
    if (!job?.id) return;
    setAnalyzing(true);
    setError(null);

    try {
      const response = await fetch(`/api/jobs/${job.id}/analyze`, {
        method: "POST",
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to analyze job listing");
      }

      const result = await response.json();
      setAnalysis(result);
    } catch (err: unknown) {
      const errMsg =
        err instanceof Error ? err.message : "Failed to generate analysis";
      setError(errMsg);
    } finally {
      setAnalyzing(false);
    }
  };

  const getVerdictDetails = (verdict: "APPLY" | "CAUTION" | "IGNORE") => {
    switch (verdict) {
      case "APPLY":
        return {
          color: "success",
          bgColor: "bg-emerald-950/40 border-emerald-900/60 text-emerald-400",
          tagColor: "emerald",
          icon: <CheckCircle2 className="text-emerald-400" size={18} />,
          text: "Recommended to Apply",
        };
      case "CAUTION":
        return {
          color: "warning",
          bgColor: "bg-amber-950/40 border-amber-900/60 text-amber-400",
          tagColor: "amber",
          icon: <AlertTriangle className="text-amber-400" size={18} />,
          text: "Proceed with Caution",
        };
      case "IGNORE":
        return {
          color: "error",
          bgColor: "bg-rose-950/40 border-rose-900/60 text-rose-400",
          tagColor: "rose",
          icon: <XCircle className="text-rose-400" size={18} />,
          text: "Not Recommended",
        };
    }
  };

  const verdictDetails = analysis ? getVerdictDetails(analysis.verdict) : null;

  return (
    <Card className="bg-zinc-950 border-zinc-800 text-white shadow-xl rounded-2xl p-4">
      <Space direction="vertical" size="large" style={{ width: "100%" }}>
        {/* Header Section */}
        <div>
          <div className="flex justify-between items-start gap-4">
            <Title level={2} style={{ color: "#fff", margin: 0 }}>
              {job.title}
            </Title>
            <Space size="middle" className="shrink-0">
              <Button
                type="primary"
                icon={<FileText size={14} />}
                onClick={() => router.push(`/jobs/${job.id}/application`)}
              >
                Create CV
              </Button>
              {job.url && (
                <a
                  href={job.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-400 hover:text-blue-300 hover:underline mt-2"
                >
                  View Original Listing
                </a>
              )}
            </Space>
          </div>
          <Text className="text-blue-400 text-lg font-medium block mt-1">
            {job.company}
          </Text>
        </div>

        {/* Metadata Badges */}
        <Space size="middle" wrap className="text-zinc-400 text-sm">
          {Array.isArray(job.location) && job.location.length > 0 && (
            <span className="flex items-center gap-1.5">
              <MapPin size={16} />
              {job.location.join(", ")}
            </span>
          )}
          {job.locationType && (
            <span className="flex items-center gap-1.5">
              <Globe size={16} />
              <Tag
                color="cyan"
                className="m-0 border-0 bg-cyan-950/50 text-cyan-400 uppercase text-xs"
              >
                {job.locationType}
              </Tag>
            </span>
          )}
          {job.jobType && (
            <span className="flex items-center gap-1.5">
              <Briefcase size={16} />
              <Tag
                color="blue"
                className="m-0 border-0 bg-blue-950/50 text-blue-400 uppercase text-xs"
              >
                {job.jobType}
              </Tag>
            </span>
          )}
          {job.postedAt && (
            <span className="flex items-center gap-1.5">
              <Calendar size={16} />
              {new Date(job.postedAt).toLocaleDateString()}
            </span>
          )}
        </Space>

        {/* Match Comparison Section — full comparative breakdown (FR-16), shown above the Deep
            Analysis card since it's the score-derived, deterministic comparison; AI Deep
            Analysis remains a separate, opt-in CTA below, unchanged. */}
        {(job.matchedSkills || job.missingSkills || job.jobFacts) && (
          <Card
            data-testid="match-comparison"
            className="bg-zinc-900/60 border-zinc-800 p-2 rounded-xl"
          >
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-2">
                <ListChecks size={18} className="text-blue-400" />
                <Title level={4} style={{ color: "#fff", margin: 0 }}>
                  Match Comparison
                </Title>
              </div>
              {job.disqualified && (
                <Tag className="m-0 border uppercase font-bold text-xs bg-rose-950/40 border-rose-900/60 text-rose-400 flex items-center gap-1">
                  <Ban size={12} />
                  Disqualified
                </Tag>
              )}
            </div>

            {job.disqualified && job.disqualifyReason && (
              <div className="mb-4 p-3 rounded-lg border bg-rose-950/30 border-rose-900/60 text-rose-300 text-xs leading-relaxed">
                {job.disqualifyReason}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 size={12} />
                  Matched Must-Have Skills
                </div>
                {job.matchedSkills && job.matchedSkills.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {job.matchedSkills.map((skill) => (
                      <Tag
                        key={skill}
                        className="m-0 border-0 bg-emerald-950/40 text-emerald-400 text-xs py-0.5 px-2 rounded font-medium"
                      >
                        {skill}
                      </Tag>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-zinc-500">None identified.</div>
                )}
              </div>

              <div className="space-y-2">
                <div className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1">
                  <Lightbulb size={12} />
                  Missing Must-Have Skills
                </div>
                {job.missingSkills && job.missingSkills.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {job.missingSkills.map((skill) => (
                      <Tag
                        key={skill}
                        className="m-0 border-0 bg-amber-950/40 text-amber-400 text-xs py-0.5 px-2 rounded font-medium"
                      >
                        {skill}
                      </Tag>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-zinc-500">
                    All must-have requirements matched.
                  </div>
                )}
              </div>
            </div>

            {job.jobFacts && job.jobFacts.niceToHave.length > 0 && (
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="text-xs font-bold uppercase tracking-wider text-cyan-400 flex items-center gap-1">
                    <CheckCircle2 size={12} />
                    Matched Nice-to-Have Skills
                  </div>
                  {job.niceToHaveMatched && job.niceToHaveMatched.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {job.niceToHaveMatched.map((skill) => (
                        <Tag
                          key={skill}
                          className="m-0 border-0 bg-cyan-950/40 text-cyan-400 text-xs py-0.5 px-2 rounded font-medium"
                        >
                          {skill}
                        </Tag>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-zinc-500">
                      None identified.
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1">
                    <Lightbulb size={12} />
                    Missing Nice-to-Have Skills
                  </div>
                  {job.niceToHaveMissing && job.niceToHaveMissing.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {job.niceToHaveMissing.map((skill) => (
                        <Tag
                          key={skill}
                          className="m-0 border border-zinc-700 bg-transparent text-zinc-400 text-xs py-0.5 px-2 rounded font-medium"
                        >
                          {skill}
                        </Tag>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-zinc-500">
                      All nice-to-have skills matched.
                    </div>
                  )}
                </div>
              </div>
            )}

            {job.jobFacts &&
              job.jobFacts.softSkills &&
              job.jobFacts.softSkills.length > 0 && (
                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <div className="text-xs font-bold uppercase tracking-wider text-violet-400 flex items-center gap-1">
                      <CheckCircle2 size={12} />
                      Matched Soft Skills
                    </div>
                    {job.softSkillsMatched &&
                    job.softSkillsMatched.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {job.softSkillsMatched.map((skill) => (
                          <Tag
                            key={skill}
                            className="m-0 border-0 bg-violet-950/40 text-violet-400 text-xs py-0.5 px-2 rounded font-medium"
                          >
                            {skill}
                          </Tag>
                        ))}
                      </div>
                    ) : (
                      <div className="text-xs text-zinc-500">
                        None identified.
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1">
                      <Lightbulb size={12} />
                      Missing Soft Skills
                    </div>
                    {job.softSkillsMissing &&
                    job.softSkillsMissing.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {job.softSkillsMissing.map((skill) => (
                          <Tag
                            key={skill}
                            className="m-0 border border-zinc-700 bg-transparent text-zinc-400 text-xs py-0.5 px-2 rounded font-medium"
                          >
                            {skill}
                          </Tag>
                        ))}
                      </div>
                    ) : (
                      <div className="text-xs text-zinc-500">
                        All soft skills matched.
                      </div>
                    )}
                  </div>
                </div>
              )}

            <Divider className="my-4 border-zinc-800" />

            <div className="space-y-2">
              <div className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                Conditions &amp; Preferences
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-xs text-zinc-300">
                <div>
                  Work Mode: {job.jobFacts?.workMode ?? "Not specified"}
                </div>
                <div>Worldwide: {formatBoolean(job.jobFacts?.isWorldwide)}</div>
                <div>
                  US Work Auth Required:{" "}
                  {formatBoolean(job.jobFacts?.requiresUsWorkAuth)}
                </div>
                <div>
                  Visa / Relocation Support:{" "}
                  {formatBoolean(job.jobFacts?.providesRelocationVisa)}
                </div>
                <div>
                  Employment Type:{" "}
                  {job.jobFacts?.employmentType ?? "Not specified"}
                </div>
                <div>Salary Range: {formatSalaryRange(job.jobFacts)}</div>
                <div>
                  Seniority: {job.jobFacts?.seniority ?? "Not specified"}
                </div>
                <div>
                  Min. Years Experience:{" "}
                  {job.jobFacts?.yearsExperienceMin ?? "Not specified"}
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* AI Deep Analysis Section */}
        <Card className="bg-zinc-900/60 border-zinc-800 p-2 rounded-xl">
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-2">
              <Sparkles size={18} className="text-amber-400" />
              <Title level={4} style={{ color: "#fff", margin: 0 }}>
                AI Candidacy Match
              </Title>
            </div>
            {analysis && (
              <Tag
                className={`m-0 border uppercase font-bold text-xs ${verdictDetails?.bgColor}`}
              >
                {analysis.verdict}
              </Tag>
            )}
          </div>

          {checkingCache ? (
            <div className="flex items-center justify-center py-8">
              <Spin size="small" />
              <span className="text-zinc-500 text-xs ml-2">
                Loading match status...
              </span>
            </div>
          ) : analysis ? (
            <div className="space-y-4">
              {/* Verdict Banner */}
              <div
                className={`flex items-start gap-3 p-4 rounded-xl border ${verdictDetails?.bgColor}`}
              >
                {verdictDetails?.icon}
                <div className="space-y-1">
                  <div className="font-bold text-sm text-white">
                    {verdictDetails?.text}
                  </div>
                  <div className="text-xs leading-relaxed text-zinc-300">
                    {analysis.justification}
                  </div>
                </div>
              </div>

              {/* Match Details Lists */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Strengths */}
                <div className="space-y-2">
                  <div className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 size={12} />
                    Strengths
                  </div>
                  {analysis.strengths.length > 0 ? (
                    <List
                      size="small"
                      dataSource={analysis.strengths}
                      renderItem={(item) => (
                        <List.Item className="border-0 p-0 py-1 text-zinc-300 text-xs leading-relaxed align-top">
                          • {item}
                        </List.Item>
                      )}
                    />
                  ) : (
                    <div className="text-xs text-zinc-500">
                      None identified.
                    </div>
                  )}
                </div>

                {/* Weaknesses */}
                <div className="space-y-2">
                  <div className="text-xs font-bold uppercase tracking-wider text-rose-400 flex items-center gap-1">
                    <XCircle size={12} />
                    Weaknesses / Gaps
                  </div>
                  {analysis.weaknesses.length > 0 ? (
                    <List
                      size="small"
                      dataSource={analysis.weaknesses}
                      renderItem={(item) => (
                        <List.Item className="border-0 p-0 py-1 text-zinc-300 text-xs leading-relaxed align-top">
                          • {item}
                        </List.Item>
                      )}
                    />
                  ) : (
                    <div className="text-xs text-zinc-500">
                      None identified.
                    </div>
                  )}
                </div>
              </div>

              <Divider className="my-2 border-zinc-800" />

              {/* Missing Skills */}
              <div className="space-y-2">
                <div className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1">
                  <Lightbulb size={12} />
                  Missing Required Skills
                </div>
                {analysis.missingSkills.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {analysis.missingSkills.map((skill, index) => (
                      <Tag
                        key={index}
                        className="m-0 border-0 bg-amber-950/40 text-amber-400 text-xs py-0.5 px-2 rounded font-medium"
                      >
                        {skill}
                      </Tag>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-zinc-500">
                    All technical requirements matched.
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-6 text-center space-y-3">
              <p className="text-xs text-zinc-400 max-w-sm m-0">
                Perform a deep comparative match analysis to extract your
                strengths, weaknesses, gaps, and candidacy recommendation.
              </p>
              <Button
                type="primary"
                icon={<Sparkles size={14} />}
                onClick={handleStartAnalysis}
                loading={analyzing}
                disabled={!job.isFullDescriptionFetched}
                className="bg-blue-600 hover:bg-blue-500 border-0 text-white font-bold h-9 px-4 rounded-lg"
              >
                Analyze with AI
              </Button>
              {!job.isFullDescriptionFetched && (
                <Text className="text-[10px] text-amber-400 font-medium">
                  * Job description must be loaded to run analysis
                </Text>
              )}
              {error && (
                <Text type="danger" className="text-xs mt-2 block font-medium">
                  {error}
                </Text>
              )}
            </div>
          )}
        </Card>

        {/* Job Description Card */}
        <Card className="bg-zinc-900 border-zinc-800 p-2 rounded-xl">
          <Title
            level={4}
            style={{ color: "#fff", marginTop: 0, marginBottom: 16 }}
          >
            Job Description
          </Title>

          {!job.isFullDescriptionFetched ? (
            <div className="flex flex-col items-center justify-center py-12 text-center space-y-4">
              <Spin size="large" />
              <div className="space-y-1">
                <Paragraph
                  style={{ color: "#fff", fontWeight: 600, fontSize: 16 }}
                  className="flex items-center justify-center gap-2 m-0"
                >
                  <AlertCircle
                    size={18}
                    className="text-blue-400 animate-pulse"
                  />
                  Description Pending Retrieval
                </Paragraph>
                <Paragraph
                  style={{ color: "#a1a1aa", fontSize: 12 }}
                  className="max-w-sm m-0"
                >
                  The full job description is currently being retrieved from the
                  portal. Please check back shortly.
                </Paragraph>
              </div>
            </div>
          ) : (
            <Paragraph
              style={{ color: "#d4d4d8", fontSize: 14 }}
              className="whitespace-pre-wrap leading-relaxed"
            >
              {job.fullDescription || "No description available."}
            </Paragraph>
          )}
        </Card>
      </Space>
    </Card>
  );
}
