import type { JobDocument } from '../types/job.js'

export const sampleJobs: Array<Omit<JobDocument, 'createdAt' | 'updatedAt'>> = [
  {
    jobTitle: 'Junior MERN Stack Developer',
    company: 'Sample Technology Company',
    location: 'Noida',
    employmentType: 'Full-time',
    description: 'Build and maintain web applications using the MERN stack and collaborate with product teams.',
    requiredSkills: [
      { name: 'React', importance: 'Required', weight: 25 },
      { name: 'Node.js', importance: 'Required', weight: 25 },
      { name: 'MongoDB', importance: 'Required', weight: 20 },
      { name: 'Express.js', importance: 'Required', weight: 15 },
      { name: 'Git', importance: 'Preferred', weight: 15 },
    ],
    isActive: true,
  },
  {
    jobTitle: 'Backend Engineering Intern',
    company: 'Campus Cloud Labs',
    location: 'Remote',
    employmentType: 'Internship',
    description: 'Support API development, database integrations, testing, and backend production improvements.',
    requiredSkills: [
      { name: 'Node.js', importance: 'Required', weight: 25 },
      { name: 'REST APIs', importance: 'Required', weight: 25 },
      { name: 'SQL', importance: 'Required', weight: 20 },
      { name: 'Git', importance: 'Preferred', weight: 15 },
      { name: 'Testing', importance: 'Preferred', weight: 15 },
    ],
    isActive: true,
  },
  {
    jobTitle: 'Frontend Developer',
    company: 'Product Studio',
    location: 'Bengaluru',
    employmentType: 'Full-time',
    description: 'Create accessible, responsive interfaces and integrate frontend applications with APIs.',
    requiredSkills: [
      { name: 'React', importance: 'Required', weight: 30 },
      { name: 'JavaScript', importance: 'Required', weight: 25 },
      { name: 'HTML/CSS', importance: 'Required', weight: 20 },
      { name: 'REST APIs', importance: 'Preferred', weight: 15 },
      { name: 'Testing', importance: 'Preferred', weight: 10 },
    ],
    isActive: true,
  },
  {
    jobTitle: 'AI Engineering Trainee',
    company: 'Applied Intelligence Group',
    location: 'Remote',
    employmentType: 'Remote',
    description: 'Prototype machine learning solutions, integrate model APIs, and document experiments.',
    requiredSkills: [
      { name: 'Python', importance: 'Required', weight: 30 },
      { name: 'Machine Learning', importance: 'Required', weight: 25 },
      { name: 'Deep Learning', importance: 'Required', weight: 20 },
      { name: 'SQL', importance: 'Preferred', weight: 10 },
      { name: 'Git', importance: 'Preferred', weight: 15 },
    ],
    isActive: true,
  },
]
