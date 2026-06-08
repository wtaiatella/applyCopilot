import { render, screen } from '@testing-library/react'
import { Button } from 'antd'
import { describe, it, expect } from '@jest/globals'

// Example test to demonstrate testing setup
describe('Testing Setup', () => {
  it('should render Ant Design Button', () => {
    render(<Button>Test Button</Button>)
    const button = screen.getByRole('button', { name: /test button/i })
    expect(button).toBeInTheDocument()
  })

  it('should have correct button text', () => {
    render(<Button>Click Me</Button>)
    const button = screen.getByText('Click Me')
    expect(button).toBeInTheDocument()
  })

  it('should match snapshot', () => {
    const { container } = render(<Button type="primary">Primary Button</Button>)
    expect(container.firstChild).toMatchSnapshot()
  })
})

// Example utility function test
describe('Utility Functions', () => {
  it('should format date correctly', () => {
    const date = new Date('2024-01-01')
    const formatted = date.toLocaleDateString()
    expect(formatted).toBe('1/1/2024')
  })

  it('should validate email format', () => {
    const email = 'test@example.com'
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    expect(emailRegex.test(email)).toBe(true)
  })
})
