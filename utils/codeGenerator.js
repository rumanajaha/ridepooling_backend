// Word list for human-friendly ride codes
const animals = [
  'Tiger', 'Panda', 'Eagle', 'Dolphin', 'Wolf', 'Fox', 'Bear', 'Lion',
  'Hawk', 'Raven', 'Owl', 'Shark', 'Whale', 'Dragon', 'Phoenix', 'Cobra',
  'Falcon', 'Lynx', 'Jaguar', 'Cheetah', 'Leopard', 'Rhino', 'Elephant',
  'Giraffe', 'Zebra', 'Koala', 'Otter', 'Seal', 'Penguin', 'Parrot'
];

const colors = [
  'Red', 'Blue', 'Green', 'Silver', 'Gold', 'Purple', 'Orange', 'Pink',
  'Yellow', 'Cyan', 'Magenta', 'Violet', 'Crimson', 'Azure', 'Emerald',
  'Ruby', 'Sapphire', 'Amber', 'Coral', 'Jade', 'Onyx', 'Pearl', 'Ivory'
];

const adjectives = [
  'Swift', 'Brave', 'Bold', 'Bright', 'Cool', 'Epic', 'Fast', 'Grand',
  'Happy', 'Lucky', 'Mighty', 'Noble', 'Quick', 'Smart', 'Strong', 'Wild',
  'Calm', 'Fierce', 'Gentle', 'Proud', 'Silent', 'Steady', 'Nimble', 'Radiant'
];

export function generateRideCode() {
  const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
  const animal = animals[Math.floor(Math.random() * animals.length)];
  const number = Math.floor(Math.random() * 99) + 1;
  
  return `${adjective} ${animal} ${number}`;
}

export function generateNumericCode() {
  // Fallback: 6-digit numeric code
  return Math.floor(100000 + Math.random() * 900000).toString();
}
