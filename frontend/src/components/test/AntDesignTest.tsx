'use client'

import { Button, Card, Typography, Space, Flex } from 'antd'
import { GithubOutlined, LinkedinOutlined } from '@ant-design/icons'

const { Title, Text } = Typography

export default function AntDesignTest() {
  return (
    <div className="max-w-4xl mx-auto py-8">
      <Card className="mb-6 shadow-md border-gray-800">
        <Flex vertical gap={24}>
          <Title level={2} className="m-0">ApplyCopilot - Command Center</Title>
          <Text className="text-lg opacity-80">
            Next-generation job application orchestrator. Seamlessly integrating AI with professional discovery.
          </Text>
          
          <Space wrap>
            <Button type="primary" size="large">
              Quick Discovery
            </Button>
            <Button size="large" ghost>
              View Stats
            </Button>
          </Space>
          
          <Space>
            <Button icon={<GithubOutlined />} ghost>GitHub</Button>
            <Button icon={<LinkedinOutlined />} ghost>LinkedIn</Button>
          </Space>
        </Flex>
      </Card>
      
      <Card title="System Readiness" className="mb-6 shadow-sm border-gray-800">
        <Flex vertical gap={12}>
          <Text>Next.js 16: <Text strong className="text-green-500">Active</Text></Text>
          <Text>AI Engine: <Text strong className="text-blue-500">Ready</Text></Text>
          <Text>Job Bank: <Text strong className="text-purple-500">Monitoring</Text></Text>
          <Text>Ant Design 6: <Text strong>Operational</Text></Text>
          <Text>Dark Mode: <Text strong className="text-yellow-500">Enabled</Text></Text>
        </Flex>
      </Card>
    </div>
  )
}
