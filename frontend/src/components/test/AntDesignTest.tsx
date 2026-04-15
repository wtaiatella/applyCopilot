'use client'

import { Button, Card, Typography, Space } from 'antd'
import { GithubOutlined, LinkedinOutlined } from '@ant-design/icons'

const { Title, Text } = Typography

export default function AntDesignTest() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
      <div className="max-w-4xl mx-auto">
        <Card className="mb-6">
          <Space direction="vertical" size="large" className="w-full">
            <Title level={2}>ApplyCopilot - Ant Design Integration Test</Title>
            <Text>
              This component tests the integration between Ant Design 6, Tailwind CSS 4, and Next.js 16.
            </Text>
            
            <Space wrap>
              <Button type="primary" size="large">
                Primary Button
              </Button>
              <Button size="large">
                Default Button
              </Button>
              <Button type="dashed" size="large">
                Dashed Button
              </Button>
            </Space>
            
            <Space>
              <Button icon={<GithubOutlined />}>GitHub</Button>
              <Button icon={<LinkedinOutlined />}>LinkedIn</Button>
            </Space>
          </Space>
        </Card>
        
        <Card title="Configuration Status" className="mb-6">
          <Space direction="vertical" className="w-full">
            <Text>Next.js 16: <Text strong>Installed</Text></Text>
            <Text>React 19: <Text strong>Installed</Text></Text>
            <Text>TypeScript: <Text strong>Configured</Text></Text>
            <Text>Ant Design 6: <Text strong>Installed</Text></Text>
            <Text>Tailwind CSS 4: <Text strong>Installed</Text></Text>
            <Text>Dark Mode: <Text strong>Enabled</Text></Text>
          </Space>
        </Card>
      </div>
    </div>
  )
}
