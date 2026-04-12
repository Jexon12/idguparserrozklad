/**
 * @typedef {Object} Lesson
 * @property {string} id
 * @property {string} date
 * @property {number} dow
 * @property {number} pair
 * @property {string} discipline
 * @property {string} type
 * @property {string} teacher
 * @property {string} group
 * @property {string} sourceName
 * @property {string} room
 * @property {string} start
 * @property {string} end
 */

/**
 * @typedef {Object} SessionItem
 * @property {string} term
 * @property {string} studyForm
 * @property {string} discipline
 * @property {string} teacher
 * @property {string} date
 * @property {string} time
 * @property {string} room
 * @property {string[]} groups
 */

/**
 * @typedef {Object} AuditEvent
 * @property {string} ts
 * @property {string} action
 * @property {string} scope
 * @property {string} ip
 * @property {Record<string, any>} meta
 */

