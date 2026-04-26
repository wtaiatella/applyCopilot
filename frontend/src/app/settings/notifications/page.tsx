'use client';

import React, { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import {
  Card,
  Form,
  Switch,
  Select,
  Input,
  Button,
  Alert,
  Divider,
  TimePicker,
  Space,
  Typography,
  Row,
  Col,
  message,
  Skeleton,
} from 'antd';
import {
  MailOutlined,
  WhatsAppOutlined,
  BellOutlined,
  ClockCircleOutlined,
  MoonOutlined,
  SaveOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';

const { Title, Text, Paragraph } = Typography;
const { Option } = Select;

interface NotificationPreferences {
  emailEnabled: boolean;
  whatsappEnabled: boolean;
  whatsappNumber: string | null;
  jobMatchFrequency: 'IMMEDIATE' | 'DIGEST' | 'DAILY' | 'WEEKLY' | 'NEVER';
  digestDay: number | null;
  digestTime: string | null;
  notifyOnJobMatches: boolean;
  notifyOnApplicationUpdates: boolean;
  notifyOnInterviewScheduled: boolean;
  notifyOnDeadline: boolean;
  notifyOnSecurityAlert: boolean;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  timezone: string;
  updatedAt?: string;
}

const frequencyOptions = [
  { value: 'IMMEDIATE', label: 'Immediate (as soon as found)' },
  { value: 'DIGEST', label: 'Digest (batched every 5 minutes)' },
  { value: 'DAILY', label: 'Daily summary' },
  { value: 'WEEKLY', label: 'Weekly summary' },
  { value: 'NEVER', label: 'Never (disable)' },
];

const weekDays = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
];

const timezones = [
  { value: 'America/Sao_Paulo', label: 'São Paulo (GMT-3)' },
  { value: 'America/New_York', label: 'New York (EST/EDT)' },
  { value: 'America/Los_Angeles', label: 'Los Angeles (PST/PDT)' },
  { value: 'Europe/London', label: 'London (GMT/BST)' },
  { value: 'Europe/Paris', label: 'Paris (CET/CEST)' },
  { value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
  { value: 'Australia/Sydney', label: 'Sydney (AEST/AEDT)' },
];

export default function NotificationSettingsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Redirect if not authenticated
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
    }
  }, [status, router]);

  // Fetch preferences
  useEffect(() => {
    if (status === 'authenticated') {
      fetchPreferences();
    }
  }, [status]);

  const fetchPreferences = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/settings/notifications');

      if (!response.ok) {
        if (response.status === 401) {
          router.push('/auth/signin');
          return;
        }
        throw new Error('Failed to load preferences');
      }

      const data = await response.json();
      setPreferences(data);

      // Set form values
      form.setFieldsValue({
        ...data,
        digestTime: data.digestTime ? dayjs(data.digestTime, 'HH:mm') : null,
        quietHoursStart: data.quietHoursStart ? dayjs(data.quietHoursStart, 'HH:mm') : null,
        quietHoursEnd: data.quietHoursEnd ? dayjs(data.quietHoursEnd, 'HH:mm') : null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load preferences');
      message.error('Failed to load notification preferences');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (values: Record<string, unknown>) => {
    try {
      setSaving(true);

      // Format time values
      const formattedValues = {
        ...values,
        digestTime: values.digestTime ? dayjs(values.digestTime).format('HH:mm') : null,
        quietHoursStart: values.quietHoursStart ? dayjs(values.quietHoursStart).format('HH:mm') : null,
        quietHoursEnd: values.quietHoursEnd ? dayjs(values.quietHoursEnd).format('HH:mm') : null,
      };

      const response = await fetch('/api/settings/notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formattedValues),
      });

      if (!response.ok) {
        if (response.status === 401) {
          router.push('/auth/signin');
          return;
        }
        throw new Error('Failed to save preferences');
      }

      const data = await response.json();
      setPreferences(data);
      message.success('Notification preferences saved successfully');
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Failed to save preferences');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    try {
      setSaving(true);

      const response = await fetch('/api/settings/notifications', {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to reset preferences');
      }

      message.success('Preferences reset to defaults');
      await fetchPreferences();
    } catch (err) {
      message.error('Failed to reset preferences');
    } finally {
      setSaving(false);
    }
  };

  if (status === 'loading' || loading) {
    return (
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '24px' }}>
        <Skeleton active paragraph={{ rows: 10 }} />
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '24px' }}>
        <Alert
          message="Error"
          description={error}
          type="error"
          showIcon
          action={
            <Button onClick={fetchPreferences} icon={<ReloadOutlined />}>
              Retry
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '24px' }}>
      <Title level={2}>
        <BellOutlined /> Notification Settings
      </Title>
      <Paragraph type="secondary">
        Manage how and when you receive notifications from ApplyCopilot.
        {preferences?.updatedAt && (
          <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
            Last updated: {new Date(preferences.updatedAt).toLocaleString()}
          </Text>
        )}
      </Paragraph>

      <Form
        form={form}
        layout="vertical"
        onFinish={handleSave}
        style={{ marginTop: 24 }}
      >
        {/* Channel Preferences */}
        <Card title="Notification Channels" style={{ marginBottom: 24 }}>
          <Form.Item
            name="emailEnabled"
            valuePropName="checked"
            label={
              <Space>
                <MailOutlined />
                <Text strong>Email Notifications</Text>
              </Space>
            }
          >
            <Switch checkedChildren="On" unCheckedChildren="Off" />
          </Form.Item>
          <Text type="secondary">
            Receive notifications via email at {session?.user?.email}
          </Text>

          <Divider />

          <Form.Item
            name="whatsappEnabled"
            valuePropName="checked"
            label={
              <Space>
                <WhatsAppOutlined />
                <Text strong>WhatsApp Notifications</Text>
              </Space>
            }
          >
            <Switch checkedChildren="On" unCheckedChildren="Off" />
          </Form.Item>

          <Form.Item
            name="whatsappNumber"
            label="WhatsApp Phone Number"
            rules={[
              {
                pattern: /^\+?[1-9]\d{1,14}$/,
                message: 'Please enter a valid phone number with country code',
              },
            ]}
          >
            <Input placeholder="+1234567890" style={{ maxWidth: 300 }} />
          </Form.Item>
          <Text type="secondary">
            Include country code (e.g., +55 for Brazil, +1 for USA)
          </Text>
        </Card>

        {/* Job Match Frequency */}
        <Card title="Job Match Notifications" style={{ marginBottom: 24 }}>
          <Form.Item
            name="jobMatchFrequency"
            label={
              <Space>
                <ClockCircleOutlined />
                <Text strong>Notification Frequency</Text>
              </Space>
            }
          >
            <Select style={{ maxWidth: 300 }}>
              {frequencyOptions.map((option) => (
                <Option key={option.value} value={option.value}>
                  {option.label}
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            noStyle
            shouldUpdate={(prevValues, currentValues) =>
              prevValues.jobMatchFrequency !== currentValues.jobMatchFrequency
            }
          >
            {({ getFieldValue }) => {
              const frequency = getFieldValue('jobMatchFrequency');
              if (frequency !== 'DAILY' && frequency !== 'WEEKLY') {
                return null;
              }
              return (
                <>
                  <Form.Item name="digestDay" label="Digest Day">
                    <Select style={{ maxWidth: 200 }}>
                      {weekDays.map((day) => (
                        <Option key={day.value} value={day.value}>
                          {day.label}
                        </Option>
                      ))}
                    </Select>
                  </Form.Item>
                  <Form.Item name="digestTime" label="Digest Time">
                    <TimePicker format="HH:mm" style={{ maxWidth: 200 }} />
                  </Form.Item>
                </>
              );
            }}
          </Form.Item>
        </Card>

        {/* Notification Types */}
        <Card title="Notification Types" style={{ marginBottom: 24 }}>
          <Row gutter={[16, 16]}>
            <Col xs={24} sm={12}>
              <Form.Item
                name="notifyOnJobMatches"
                valuePropName="checked"
                label="Job Matches"
              >
                <Switch />
              </Form.Item>
              <Text type="secondary">New jobs matching your profile</Text>
            </Col>

            <Col xs={24} sm={12}>
              <Form.Item
                name="notifyOnApplicationUpdates"
                valuePropName="checked"
                label="Application Updates"
              >
                <Switch />
              </Form.Item>
              <Text type="secondary">Status changes on your applications</Text>
            </Col>

            <Col xs={24} sm={12}>
              <Form.Item
                name="notifyOnInterviewScheduled"
                valuePropName="checked"
                label="Interview Scheduled"
              >
                <Switch />
              </Form.Item>
              <Text type="secondary">Interview invitations via WhatsApp</Text>
            </Col>

            <Col xs={24} sm={12}>
              <Form.Item
                name="notifyOnDeadline"
                valuePropName="checked"
                label="Deadline Reminders"
              >
                <Switch />
              </Form.Item>
              <Text type="secondary">Approaching application deadlines</Text>
            </Col>

            <Col xs={24} sm={12}>
              <Form.Item
                name="notifyOnSecurityAlert"
                valuePropName="checked"
                label="Security Alerts"
              >
                <Switch disabled checked />
              </Form.Item>
              <Text type="secondary">
                Password changes, suspicious activity (always enabled)
              </Text>
            </Col>
          </Row>
        </Card>

        {/* Quiet Hours */}
        <Card
          title={
            <Space>
              <MoonOutlined />
              <Text strong>Quiet Hours</Text>
            </Space>
          }
          style={{ marginBottom: 24 }}
        >
          <Paragraph>
            During quiet hours, non-critical notifications will be delayed until the end of the quiet period.
          </Paragraph>

          <Row gutter={16}>
            <Col xs={24} sm={12}>
              <Form.Item name="quietHoursStart" label="Start Time">
                <TimePicker format="HH:mm" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="quietHoursEnd" label="End Time">
                <TimePicker format="HH:mm" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="timezone" label="Timezone">
            <Select style={{ maxWidth: 300 }}>
              {timezones.map((tz) => (
                <Option key={tz.value} value={tz.value}>
                  {tz.label}
                </Option>
              ))}
            </Select>
          </Form.Item>
        </Card>

        {/* Actions */}
        <Form.Item>
          <Space size="middle">
            <Button
              type="primary"
              htmlType="submit"
              loading={saving}
              icon={<SaveOutlined />}
              size="large"
            >
              Save Changes
            </Button>
            <Button
              onClick={handleReset}
              loading={saving}
              icon={<ReloadOutlined />}
              size="large"
            >
              Reset to Defaults
            </Button>
          </Space>
        </Form.Item>
      </Form>
    </div>
  );
}
