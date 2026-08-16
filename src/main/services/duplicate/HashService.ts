import { createHash } from 'crypto'
import { createReadStream } from 'fs'
import { open } from 'fs/promises'
import { IHashService } from './types'

export class HashService implements IHashService {
  /**
   * Computes full SHA-256 binary digest for exact 100% binary matching
   */
  async computeSha256(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = createHash('sha256')
      const stream = createReadStream(filePath)

      stream.on('data', (chunk) => hash.update(chunk))
      stream.on('end', () => resolve(hash.digest('hex')))
      stream.on('error', (err) => reject(err))
    })
  }

  /**
   * Computes ultra-fast partial SHA-256 (64KB Head + 64KB Tail) for fast binary candidate pruning
   */
  async computePartialSha256(filePath: string, headBytes: number = 64 * 1024): Promise<string> {
    try {
      const fileHandle = await open(filePath, 'r')
      try {
        const stat = await fileHandle.stat()
        const fileSize = stat.size

        if (fileSize <= headBytes * 2) {
          fileHandle.close()
          return this.computeSha256(filePath)
        }

        const headBuffer = Buffer.alloc(headBytes)
        await fileHandle.read(headBuffer, 0, headBytes, 0)

        const tailBuffer = Buffer.alloc(headBytes)
        await fileHandle.read(tailBuffer, 0, headBytes, fileSize - headBytes)

        const hash = createHash('sha256')
        hash.update(headBuffer)
        hash.update(Buffer.from(`size_${fileSize}`))
        hash.update(tailBuffer)

        return hash.digest('hex')
      } finally {
        await fileHandle.close()
      }
    } catch {
      return ''
    }
  }
}

export const defaultHashService = new HashService()
