"use client";

import React, { useState } from "react";
import { Card, Input, Button, Select, InputNumber, Table, Modal } from "antd";
import { PlusOutlined, DeleteOutlined, CloudSyncOutlined } from "@ant-design/icons";
import { SkillDTO, ProficiencyLevel } from "../../types/profile";
import { useProfileContext } from "../../contexts/ProfileContext";

const { Option } = Select;

interface SkillsFormProps {
  skills: SkillDTO[];
  updateSkillsState: (skills: SkillDTO[]) => void;
}

export default function SkillsForm({
  skills = [],
  updateSkillsState,
}: SkillsFormProps) {
  const { suggestSkills } = useProfileContext();
  const [loadingSuggest, setLoadingSuggest] = useState(false);
  const [name, setName] = useState("");
  const [proficiency, setProficiency] = useState<ProficiencyLevel>("INTERMEDIATE");
  const [yearsExperience, setYearsExperience] = useState<number | null>(null);

  const handleExtractSkills = async () => {
    try {
      setLoadingSuggest(true);
      await suggestSkills();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "An error occurred while suggesting skills.";
      Modal.error({
        title: "Failed to extract skills",
        content: errorMsg,
      });
    } finally {
      setLoadingSuggest(false);
    }
  };

  const sortedSkills = [...skills].sort((a, b) => a.name.localeCompare(b.name));

  const handleAddSkill = () => {
    if (!name.trim()) return;

    // Check for duplicate
    const exists = skills.some((s) => s.name.toLowerCase() === name.trim().toLowerCase());
    if (exists) {
      alert(`Skill "${name.trim()}" already exists!`);
      return;
    }

    const newSkill: SkillDTO = {
      id: `temp-${Date.now()}`,
      name: name.trim(),
      proficiency,
      yearsExperience,
    };

    updateSkillsState([...skills, newSkill]);
    setName("");
    setYearsExperience(null);
  };

  const handleDeleteSkill = (id: string) => {
    const updated = skills.filter((s) => s.id !== id);
    updateSkillsState(updated);
  };

  const handleUpdateSkillField = (id: string, field: keyof SkillDTO, value: unknown) => {
    const updated = skills.map((s) => {
      if (s.id === id) {
        return { ...s, [field]: value } as SkillDTO;
      }
      return s;
    });
    updateSkillsState(updated);
  };

  const columns = [
    {
      title: "Skill Name",
      dataIndex: "name",
      key: "name",
      render: (text: string) => <span className="text-white font-medium">{text}</span>,
    },
    {
      title: "Proficiency",
      dataIndex: "proficiency",
      key: "proficiency",
      render: (val: ProficiencyLevel, record: SkillDTO) => (
        <Select
          value={val}
          onChange={(newVal) => handleUpdateSkillField(record.id, "proficiency", newVal)}
          className="w-36 bg-zinc-950 border-zinc-800 text-white"
          popupClassName="bg-zinc-900 border-zinc-800"
        >
          <Option value="BEGINNER">Beginner</Option>
          <Option value="INTERMEDIATE">Intermediate</Option>
          <Option value="ADVANCED">Advanced</Option>
          <Option value="EXPERT">Expert</Option>
        </Select>
      ),
    },
    {
      title: "Years of Experience",
      dataIndex: "yearsExperience",
      key: "yearsExperience",
      render: (val: number | null, record: SkillDTO) => (
        <InputNumber
          min={0}
          max={100}
          value={val ?? undefined}
          onChange={(newVal) => handleUpdateSkillField(record.id, "yearsExperience", newVal)}
          className="w-24 bg-zinc-950 border-zinc-800 text-white"
          placeholder="N/A"
        />
      ),
    },
    {
      title: "Action",
      key: "action",
      width: 80,
      render: (_: unknown, record: SkillDTO) => (
        <Button
          type="text"
          danger
          icon={<DeleteOutlined />}
          onClick={() => handleDeleteSkill(record.id)}
          className="hover:bg-zinc-900"
        />
      ),
    },
  ];

  return (
    <Card 
      className="bg-zinc-900/50 border-zinc-800 text-white" 
      title={<span className="text-white font-semibold">Technical & Professional Skills</span>}
      extra={
        <Button
          size="small"
          loading={loadingSuggest}
          onClick={handleExtractSkills}
          icon={<CloudSyncOutlined />}
          className="border-blue-700/60 text-blue-400 hover:border-blue-500 hover:text-blue-300"
        >
          {loadingSuggest ? "Extracting..." : "Extract skills from profile"}
        </Button>
      }
    >
      <div className="space-y-6">
        {/* Inline Add Skill form */}
        <div className="bg-zinc-950/40 border border-zinc-850 p-4 rounded-lg space-y-3">
          <span className="text-white text-sm font-semibold block">Add a New Skill</span>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
            <div className="sm:col-span-2">
              <label className="text-zinc-400 text-xs block mb-1">Skill Name</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. React, Docker, Python"
                className="bg-zinc-900 border-zinc-800 text-white"
              />
            </div>
            <div>
              <label className="text-zinc-400 text-xs block mb-1">Proficiency</label>
              <Select
                value={proficiency}
                onChange={(value) => setProficiency(value)}
                className="w-full bg-zinc-900 border-zinc-800 text-white"
                popupClassName="bg-zinc-900 border-zinc-800"
              >
                <Option value="BEGINNER">Beginner</Option>
                <Option value="INTERMEDIATE">Intermediate</Option>
                <Option value="ADVANCED">Advanced</Option>
                <Option value="EXPERT">Expert</Option>
              </Select>
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-zinc-400 text-xs block mb-1">Years (Opt.)</label>
                <InputNumber
                  min={0}
                  value={yearsExperience ?? undefined}
                  onChange={(val) => setYearsExperience(val)}
                  className="w-full bg-zinc-900 border-zinc-800 text-white"
                  placeholder="Years"
                />
              </div>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={handleAddSkill}
                className="bg-blue-600 border-blue-600 hover:bg-blue-500 self-end h-8"
              >
                Add
              </Button>
            </div>
          </div>
        </div>

        {/* Skills list table */}
        <Table
          dataSource={sortedSkills}
          columns={columns}
          rowKey="id"
          pagination={false}
          className="dark-table"
          locale={{
            emptyText: (
              <div className="text-zinc-600 py-6 text-sm">
                No skills listed. Use the form above to add some!
              </div>
            ),
          }}
          size="small"
        />
      </div>
    </Card>
  );
}
