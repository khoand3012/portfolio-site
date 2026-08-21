import rawData from '../../content/portfolio.json';
import type { PortfolioData } from '../types';

export async function getPortfolioContent(): Promise<PortfolioData> {
  return rawData as PortfolioData;
}
