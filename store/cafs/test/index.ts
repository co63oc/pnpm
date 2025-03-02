import fs from 'fs'
import path from 'path'
import symlinkDir from 'symlink-dir'
import tempy from 'tempy'
import { fixtures } from '@pnpm/test-fixtures'
import {
  createCafs,
  checkPkgFilesIntegrity,
  getFilePathByModeInCafs,
} from '../src'

const f = fixtures(__dirname)

describe('cafs', () => {
  it('unpack', () => {
    const dest = tempy.directory()
    const cafs = createCafs(dest)
    const { filesIndex } = cafs.addFilesFromTarball(
      fs.readFileSync(f.find('node-gyp-6.1.0.tgz'))
    )
    expect(Object.keys(filesIndex)).toHaveLength(121)
    const pkgFile = filesIndex['package.json']
    expect(pkgFile.size).toBe(1121)
    expect(pkgFile.mode).toBe(420)
    expect(typeof pkgFile.checkedAt).toBe('number')
    expect(pkgFile.integrity.toString()).toBe('sha512-8xCvrlC7W3TlwXxetv5CZTi53szYhmT7tmpXF/ttNthtTR9TC7Y7WJFPmJToHaSQ4uObuZyOARdOJYNYuTSbXA==')
  })

  it('replaces an already existing file, if the integrity of it was broken', () => {
    const storeDir = tempy.directory()
    const srcDir = path.join(__dirname, 'fixtures/one-file')
    const addFiles = () => createCafs(storeDir).addFilesFromDir(srcDir)

    let addFilesResult = addFiles()

    // Modifying the file in the store
    const filePath = getFilePathByModeInCafs(storeDir, addFilesResult.filesIndex['foo.txt'].integrity, 420)
    fs.appendFileSync(filePath, 'bar')

    addFilesResult = addFiles()
    expect(fs.readFileSync(filePath, 'utf8')).toBe('foo\n')
    expect(addFilesResult.manifest).toEqual(undefined)
  })

  it('ignores broken symlinks when traversing subdirectories', () => {
    const storeDir = tempy.directory()
    const srcDir = path.join(__dirname, 'fixtures/broken-symlink')
    const addFiles = () => createCafs(storeDir).addFilesFromDir(srcDir)

    const { filesIndex } = addFiles()
    expect(filesIndex['subdir/should-exist.txt']).toBeDefined()
  })

  it('symlinks are resolved and added as regular files', async () => {
    const storeDir = tempy.directory()
    const srcDir = tempy.directory()
    const filePath = path.join(srcDir, 'index.js')
    const symlinkPath = path.join(srcDir, 'symlink.js')
    fs.writeFileSync(filePath, '// comment', 'utf8')
    fs.symlinkSync(filePath, symlinkPath)
    fs.mkdirSync(path.join(srcDir, 'lib'))
    fs.writeFileSync(path.join(srcDir, 'lib/index.js'), '// comment 2', 'utf8')
    await symlinkDir(path.join(srcDir, 'lib'), path.join(srcDir, 'lib-symlink'))

    const { filesIndex } = createCafs(storeDir).addFilesFromDir(srcDir)
    expect(filesIndex['symlink.js']).toBeDefined()
    expect(filesIndex['symlink.js']).toStrictEqual(filesIndex['index.js'])
    expect(filesIndex['lib/index.js']).toBeDefined()
    expect(filesIndex['lib/index.js']).toStrictEqual(filesIndex['lib-symlink/index.js'])
  })
})

describe('checkPkgFilesIntegrity()', () => {
  it("doesn't fail if file was removed from the store", () => {
    const storeDir = tempy.directory()
    expect(checkPkgFilesIntegrity(storeDir, {
      files: {
        foo: {
          integrity: 'sha512-8xCvrlC7W3TlwXxetv5CZTi53szYhmT7tmpXF/ttNthtTR9TC7Y7WJFPmJToHaSQ4uObuZyOARdOJYNYuTSbXA==',
          mode: 420,
          size: 10,
        },
      },
    }).passed).toBeFalsy()
  })
})

test('file names are normalized when unpacking a tarball', () => {
  const dest = tempy.directory()
  const cafs = createCafs(dest)
  const { filesIndex } = cafs.addFilesFromTarball(
    fs.readFileSync(f.find('colorize-semver-diff.tgz'))
  )
  expect(Object.keys(filesIndex).sort()).toStrictEqual([
    'LICENSE',
    'README.md',
    'lib/index.d.ts',
    'lib/index.js',
    'package.json',
  ])
})

test('broken magic in tarball headers is handled gracefully', () => {
  const dest = tempy.directory()
  const cafs = createCafs(dest)
  cafs.addFilesFromTarball(
    fs.readFileSync(f.find('jquery.dirtyforms-2.0.0.tgz'))
  )
})

test('unpack an older version of tar that prefixes with spaces', () => {
  const dest = tempy.directory()
  const cafs = createCafs(dest)
  const { filesIndex } = cafs.addFilesFromTarball(
    fs.readFileSync(f.find('parsers-3.0.0-rc.48.1.tgz'))
  )
  expect(Object.keys(filesIndex).sort()).toStrictEqual([
    'lib/grammars/resolution.d.ts',
    'lib/grammars/resolution.js',
    'lib/grammars/resolution.pegjs',
    'lib/grammars/shell.d.ts',
    'lib/grammars/shell.js',
    'lib/grammars/shell.pegjs',
    'lib/grammars/syml.d.ts',
    'lib/grammars/syml.js',
    'lib/grammars/syml.pegjs',
    'lib/index.d.ts',
    'lib/index.js',
    'lib/resolution.d.ts',
    'lib/resolution.js',
    'lib/shell.d.ts',
    'lib/shell.js',
    'lib/syml.d.ts',
    'lib/syml.js',
    'package.json',
  ])
})

test('unpack a tarball that contains hard links', () => {
  const dest = tempy.directory()
  const cafs = createCafs(dest)
  const { filesIndex } = cafs.addFilesFromTarball(
    fs.readFileSync(f.find('vue.examples.todomvc.todo-store-0.0.1.tgz'))
  )
  expect(Object.keys(filesIndex).length).toBeGreaterThan(0)
})

// Related issue: https://github.com/pnpm/pnpm/issues/7120
test('unpack should not fail when the tarball format seems to be not USTAR or GNU TAR', () => {
  const dest = tempy.directory()
  const cafs = createCafs(dest)
  const { filesIndex } = cafs.addFilesFromTarball(
    fs.readFileSync(f.find('devextreme-17.1.6.tgz'))
  )
  expect(Object.keys(filesIndex).length).toBeGreaterThan(0)
})
