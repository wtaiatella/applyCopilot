"use client";

import React, { useState } from "react";
import { Card, Form, Input, Button, Table, Checkbox, Space } from "antd";
import { PlusOutlined, DeleteOutlined } from "@ant-design/icons";
import { ReferenceDTO } from "../../types/profile";

interface ReferencesFormProps {
  references: ReferenceDTO[];
  updateReferencesState: (references: ReferenceDTO[]) => void;
}

export default function ReferencesForm({
  references = [],
  updateReferencesState,
}: ReferencesFormProps) {
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [relationship, setRelationship] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [canContact, setCanContact] = useState(false);

  const handleAddReference = () => {
    if (!name.trim()) return;

    const newRef: ReferenceDTO = {
      id: `temp-${Date.now()}`,
      name: name.trim(),
      company: company.trim() || null,
      relationship: relationship.trim() || null,
      email: email.trim() || null,
      phone: phone.trim() || null,
      canContact,
    };

    updateReferencesState([...references, newRef]);

    // Reset fields
    setName("");
    setCompany("");
    setRelationship("");
    setEmail("");
    setPhone("");
    setCanContact(false);
  };

  const handleDeleteReference = (id: string) => {
    const updated = references.filter((r) => r.id !== id);
    updateReferencesState(updated);
  };

  const handleUpdateReferenceField = (id: string, field: string, value: any) => {
    const updated = references.map((r) => {
      if (r.id === id) {
        return { ...r, [field]: value };
      }
      return r;
    });
    updateReferencesState(updated);
  };

  const columns = [
    {
      title: "Name",
      dataIndex: "name",
      key: "name",
      render: (text: string) => <span className="text-white font-medium">{text}</span>,
    },
    {
      title: "Company",
      dataIndex: "company",
      key: "company",
      render: (text: string | null) => <span className="text-zinc-300">{text || "-"}</span>,
    },
    {
      title: "Relationship",
      dataIndex: "relationship",
      key: "relationship",
      render: (text: string | null) => <span className="text-zinc-400 text-xs">{text || "-"}</span>,
    },
    {
      title: "Contact Info",
      key: "contactInfo",
      render: (_: any, record: ReferenceDTO) => (
        <div className="text-zinc-400 text-xs space-y-0.5">
          {record.email && <div>{record.email}</div>}
          {record.phone && <div>{record.phone}</div>}
          {!record.email && !record.phone && <span>-</span>}
        </div>
      ),
    },
    {
      title: "Can Contact",
      dataIndex: "canContact",
      key: "canContact",
      width: 120,
      render: (val: boolean, record: ReferenceDTO) => (
        <Checkbox
          checked={val}
          onChange={(e) => handleUpdateReferenceField(record.id, "canContact", e.target.checked)}
          className="text-zinc-300"
        >
          Yes
        </Checkbox>
      ),
    },
    {
      title: "Action",
      key: "action",
      width: 80,
      render: (_: any, record: ReferenceDTO) => (
        <Button
          type="text"
          danger
          icon={<DeleteOutlined />}
          onClick={() => handleDeleteReference(record.id)}
          className="hover:bg-zinc-900"
        />
      ),
    },
  ];

  return (
    <Card 
      className="bg-zinc-900/50 border-zinc-800 text-white" 
      title={<span className="text-white font-semibold">Professional References</span>}
    >
      <div className="space-y-6">
        {/* Inline Add Reference Form */}
        <div className="bg-zinc-950/40 border border-zinc-850 p-4 rounded-lg space-y-4">
          <span className="text-white text-sm font-semibold block">Add a New Reference</span>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <label className="text-zinc-400 text-xs block mb-1">Name</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Jane Doe"
                className="bg-zinc-900 border-zinc-800 text-white"
              />
            </div>
            <div>
              <label className="text-zinc-400 text-xs block mb-1">Company</label>
              <Input
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="e.g. Acme Corp"
                className="bg-zinc-900 border-zinc-800 text-white"
              />
            </div>
            <div>
              <label className="text-zinc-400 text-xs block mb-1">Relationship</label>
              <Input
                value={relationship}
                onChange={(e) => setRelationship(e.target.value)}
                placeholder="e.g. Engineering Manager"
                className="bg-zinc-900 border-zinc-800 text-white"
              />
            </div>
            <div>
              <label className="text-zinc-400 text-xs block mb-1">Email</label>
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="e.g. jane@example.com"
                className="bg-zinc-900 border-zinc-800 text-white"
              />
            </div>
            <div>
              <label className="text-zinc-400 text-xs block mb-1">Phone</label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g. +1 (555) 123-4567"
                className="bg-zinc-900 border-zinc-800 text-white"
              />
            </div>
            <div className="flex items-center gap-4 pt-4 sm:pt-6">
              <Checkbox
                checked={canContact}
                onChange={(e) => setCanContact(e.target.checked)}
                className="text-zinc-300"
              >
                Can Contact
              </Checkbox>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={handleAddReference}
                className="bg-blue-600 border-blue-600 hover:bg-blue-500 ml-auto"
              >
                Add Reference
              </Button>
            </div>
          </div>
        </div>

        {/* References Table */}
        <Table
          dataSource={references}
          columns={columns}
          rowKey="id"
          pagination={false}
          className="dark-table"
          locale={{
            emptyText: (
              <div className="text-zinc-600 py-6 text-sm">
                No references listed. Use the form above to add some!
              </div>
            ),
          }}
          size="small"
        />
      </div>
    </Card>
  );
}
