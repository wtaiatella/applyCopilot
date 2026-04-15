# Quickstart Guide: ApplyCopilot Job Search Automation System

**Date**: 2025-06-17  
**Purpose**: Quick setup and development guide for ApplyCopilot

## Prerequisites

### System Requirements
- **Node.js**: 18.x or higher
- **Docker**: Latest version with Docker Compose
- **Git**: For version control
- **Memory**: 8GB RAM minimum (16GB recommended for AI processing)
- **Storage**: 10GB free space

### Required Accounts
- **MongoDB Atlas** (or local MongoDB instance)
- **Google OAuth** (for social login)
- **AI Service Accounts**:
  - Google AI Studio (for Gemini API key)
  - Anthropic (for Claude API key - optional)

## Environment Setup

### 1. Clone Repository
```bash
git clone <repository-url>
cd applycopilot
```

### 2. Install Dependencies
```bash
# Install Node.js dependencies
npm install

# Install frontend dependencies
cd frontend
npm install
cd ..
```

### 3. Environment Configuration
Create environment files:

**`.env`** (non-sensitive defaults):
```env
# Database
DATABASE_URL="mongodb://localhost:27017/applycopilot"

# NextAuth
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="your-secret-here"

# AI Services (optional defaults)
OLLAMA_BASE_URL="http://localhost:11434"
```

**`.env.local`** (local development):
```env
# Local development overrides
NODE_ENV="development"
```

**`.env.agent`** (sensitive - not in git):
```env
# AI Service Keys
GEMINI_API_KEY="your-gemini-api-key"
CLAUDE_API_KEY="your-claude-api-key"

# Database
MONGODB_URL="your-mongodb-connection-string"

# Email Service
RESEND_API_KEY="your-resend-api-key"

# NextAuth
NEXTAUTH_SECRET="your-secure-secret"
```

### 4. Docker Services Setup
Start required services:

```bash
# Start MongoDB and Redis
docker-compose up -d mongodb redis

# Start Ollama (for local AI)
docker-compose up -d ollama

# Pull required Ollama models
docker exec ollama ollama pull llama3.2:3b
```

### 5. Database Setup
```bash
# Generate Prisma client
cd frontend
npx prisma generate

# Run database migrations
npx prisma db push

# Seed initial data (optional)
npm run db:seed
```

## Development Workflow

### 1. Start Development Server
```bash
cd frontend
npm run dev
```

The application will be available at `http://localhost:3000`

### 2. Run Tests
```bash
# Unit tests
npm run test

# Integration tests
npm run test:integration

# End-to-end tests
npm run test:e2e

# Test coverage
npm run test:coverage
```

### 3. Code Quality
```bash
# Lint code
npm run lint

# Format code
npm run format

# Type check
npm run type-check
```

## Feature Development

### 1. Create Feature Branch
```bash
git checkout -b feature/your-feature-name
```

### 2. Implement Feature
Follow the constitution requirements:
- Write tests first (TDD)
- Use TypeScript for all code
- Follow Ant Design + Tailwind CSS patterns
- Implement proper error handling

### 3. Test Implementation
```bash
# Run tests
npm run test

# Check coverage
npm run test:coverage

# Run e2e tests
npm run test:e2e
```

### 4. Submit Pull Request
```bash
# Commit changes
git add .
git commit -m "feat: implement your feature"

# Push and create PR
git push origin feature/your-feature-name
```

## Key Development Patterns

### 1. API Routes
Create API routes in `frontend/src/app/api/`:
```typescript
// app/api/profile/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

const requestSchema = z.object({
  name: z.string().min(1),
  email: z.string().email()
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const validated = requestSchema.parse(body)
    
    // Process request
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 400 }
    )
  }
}
```

### 2. Server Actions
Create server actions in `frontend/src/app/actions/`:
```typescript
// actions/profile.ts
'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

const updateProfileSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1)
})

export async function updateProfile(data: unknown) {
  try {
    const validated = updateProfileSchema.parse(data)
    
    // Update profile in database
    await db.profile.update({
      where: { userId },
      data: validated
    })
    
    revalidatePath('/profile')
    return { success: true }
  } catch (error) {
    return { success: false, error: error.message }
  }
}
```

### 3. Components
Create components using Ant Design + Tailwind:
```typescript
// components/ui/ProfileForm.tsx
'use client'

import { Form, Input, Button, message } from 'antd'
import { updateProfile } from '@/app/actions/profile'

export function ProfileForm({ initialData }) {
  const [form] = Form.useForm()

  const handleSubmit = async (values) => {
    const result = await updateProfile(values)
    
    if (result.success) {
      message.success('Profile updated successfully')
    } else {
      message.error(result.error)
    }
  }

  return (
    <Form
      form={form}
      initialValues={initialData}
      onFinish={handleSubmit}
      className="max-w-md mx-auto"
    >
      <Form.Item
        name="firstName"
        label="First Name"
        rules={[{ required: true }]}
      >
        <Input />
      </Form.Item>
      
      <Form.Item
        name="lastName"
        label="Last Name"
        rules={[{ required: true }]}
      >
        <Input />
      </Form.Item>
      
      <Form.Item>
        <Button type="primary" htmlType="submit">
          Update Profile
        </Button>
      </Form.Item>
    </Form>
  )
}
```

## Testing Guidelines

### 1. Unit Tests
```typescript
// __tests__/utils/validation.test.ts
import { z } from 'zod'
import { profileSchema } from '@/lib/validation'

describe('Profile Validation', () => {
  it('should validate valid profile data', () => {
    const validData = {
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com'
    }
    
    expect(() => profileSchema.parse(validData)).not.toThrow()
  })

  it('should reject invalid email', () => {
    const invalidData = {
      firstName: 'John',
      lastName: 'Doe',
      email: 'invalid-email'
    }
    
    expect(() => profileSchema.parse(invalidData)).toThrow()
  })
})
```

### 2. Integration Tests
```typescript
// __tests__/integration/profile.test.ts
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ProfileForm } from '@/components/ui/ProfileForm'

describe('Profile Form Integration', () => {
  it('should submit valid form data', async () => {
    render(<ProfileForm initialData={{}} />)
    
    fireEvent.change(screen.getByLabelText('First Name'), {
      target: { value: 'John' }
    })
    fireEvent.change(screen.getByLabelText('Last Name'), {
      target: { value: 'Doe' }
    })
    
    fireEvent.click(screen.getByText('Update Profile'))
    
    await waitFor(() => {
      expect(screen.getByText('Profile updated successfully')).toBeInTheDocument()
    })
  })
})
```

## AI Integration

### 1. Ollama Integration
```typescript
// lib/ollama/client.ts
class OllamaClient {
  private baseUrl: string

  constructor(baseUrl = 'http://localhost:11434') {
    this.baseUrl = baseUrl
  }

  async generate(prompt: string, model = 'llama3.2:3b') {
    const response = await fetch(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt,
        format: 'json'
      })
    })

    return response.json()
  }
}

export const ollamaClient = new OllamaClient()
```

### 2. TensorFlow.js Integration
```typescript
// lib/tensorflow/matcher.ts
import * as tf from '@tensorflow/tfjs'

export class JobMatcher {
  private model: tf.LayersModel | null = null

  async loadModel() {
    this.model = await tf.loadLayersModel('/models/job-matcher/model.json')
  }

  calculateSimilarity(profileVector: number[], jobVector: number[]): number {
    const profileTensor = tf.tensor2d([profileVector])
    const jobTensor = tf.tensor2d([jobVector])
    
    const similarity = tf.cosineSimilarity(profileTensor, jobTensor)
    return similarity.dataSync()[0]
  }
}
```

## Deployment

### 1. Production Build
```bash
# Build for production
npm run build

# Start production server
npm start
```

### 2. Docker Deployment
```bash
# Build and deploy with Docker
docker-compose -f docker-compose.prod.yml up -d
```

## Troubleshooting

### Common Issues

1. **Ollama Connection Failed**
   - Ensure Ollama is running: `docker ps | grep ollama`
   - Check port: `curl http://localhost:11434/api/tags`

2. **Database Connection Error**
   - Verify MongoDB is running: `docker ps | grep mongodb`
   - Check connection string in `.env`

3. **AI Service Errors**
   - Verify API keys in `.env.agent`
   - Check rate limits and quotas

4. **Build Failures**
   - Clear node_modules: `rm -rf node_modules package-lock.json`
   - Reinstall: `npm install`

### Debug Mode
Enable debug logging:
```bash
DEBUG=* npm run dev
```

## Resources

- **Next.js Documentation**: https://nextjs.org/docs
- **Ant Design**: https://ant.design/components/
- **Tailwind CSS**: https://tailwindcss.com/docs
- **Prisma**: https://www.prisma.io/docs
- **TensorFlow.js**: https://www.tensorflow.org/js
- **Ollama**: https://ollama.com/

This quickstart guide provides everything needed to set up and develop the ApplyCopilot system following all constitution requirements.
